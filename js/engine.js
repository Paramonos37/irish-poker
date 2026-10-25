// The host engine. It runs only on the host's phone: it reads the room, applies everyone's
// requests from the inbox, moves the game forward on timers, and plays for the bots.
// Every other phone just sends requests and draws whatever the room says.
(function (IP) {
  'use strict';
  const SUITS = ['h', 'd', 'c', 's'];
  const isRed = s => s === 'h' || s === 'd';
  const ts = ms => ms * (IP.TIME_SCALE || 1);
  const SPIN_MS = 3800;
  const BOT_NAMES = ['Jake', 'Mia', 'Tyler', 'Ava', 'Marcus', 'Jess', 'Nate', 'Kayla', 'Sam', 'Riley', 'Owen', 'Zoe'];
  const MAX_PLAYERS = 12;
  IP.SPIN_MS = SPIN_MS;
  IP.MAX_PLAYERS = MAX_PLAYERS;

  const clone = v => (v === undefined || v === null) ? v : JSON.parse(JSON.stringify(v));
  const arr = v => Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.keys(v).sort((a, b) => a - b).map(k => v[k]) : []);
  IP.arr = arr;
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  const rules = {
    evaluate(hand, r, g) {
      const c = arr(hand);
      if (r === 1) return ((isRed(c[0].s) ? 'red' : 'black') === g) ? 'correct' : 'wrong';
      if (r === 2) {
        if (c[1].r === c[0].r) return 'social';
        return ((g === 'higher') === (c[1].r > c[0].r)) ? 'correct' : 'wrong';
      }
      if (r === 3) {
        const lo = Math.min(c[0].r, c[1].r), hi = Math.max(c[0].r, c[1].r), x = c[2].r;
        if (x === lo || x === hi) return 'social';
        return ((g === 'between') === (x > lo && x < hi)) ? 'correct' : 'wrong';
      }
      return c[3].s === g ? 'correct' : 'wrong';
    },
    validGuess(r, g) {
      if (r === 1) return g === 'red' || g === 'black';
      if (r === 2) return g === 'higher' || g === 'lower';
      if (r === 3) return g === 'between' || g === 'outside';
      return SUITS.indexOf(g) !== -1;
    },
    botGuess(hand, r) {
      const c = arr(hand);
      if (r === 1) return Math.random() < 0.5 ? 'red' : 'black';
      if (r === 2) { if (c[0].r < 7) return 'higher'; if (c[0].r > 7) return 'lower'; return Math.random() < 0.5 ? 'higher' : 'lower'; }
      if (r === 3) return Math.abs(c[0].r - c[1].r) >= 7 ? 'between' : 'outside';
      return SUITS[Math.floor(Math.random() * 4)];
    },
    // How many of this player's cards are face up right now.
    revealedCount(G, pid) {
      if (!G) return 0;
      if (G.phase === 'end') return 4;
      if (G.phase !== 'turns') return G.round;
      const i = arr(G.order).indexOf(pid);
      const done = i < G.turn || (i === G.turn && G.step !== 'guess');
      return G.round - 1 + (done ? 1 : 0);
    }
  };
  IP.rules = rules;

  // Collects changes as one multi-path update while keeping the local copy current,
  // so later steps in the same tick see earlier changes.
  function writer(S) {
    const up = {};
    const getAt = path => { let o = S; for (const k of path.split('/')) { if (o === null || o === undefined) return undefined; o = o[k]; } return o; };
    const setS = (path, val) => {
      const ks = path.split('/');
      let o = S;
      for (let i = 0; i < ks.length - 1; i++) {
        if (o[ks[i]] === null || o[ks[i]] === undefined || typeof o[ks[i]] !== 'object') o[ks[i]] = {};
        o = o[ks[i]];
      }
      const last = ks[ks.length - 1];
      if (val === null || val === undefined) delete o[last]; else o[last] = clone(val);
    };
    const set = (path, val) => {
      setS(path, val);
      const anc = Object.keys(up).find(k => path.indexOf(k + '/') === 0);
      if (anc) { const v = getAt(anc); up[anc] = (v === undefined) ? null : clone(v); return; }
      Object.keys(up).forEach(k => { if (k.indexOf(path + '/') === 0) delete up[k]; });
      up[path] = (val === undefined || val === null) ? null : clone(val);
    };
    return { up, set, get: getAt };
  }

  IP.Engine = function (db, code, myPid) {
    const base = 'rooms/' + code;
    let iv = 0, working = false, stopped = true, fk = 0;
    const seen = new Set();

    const PL = S => S.players || {};
    const isBot = (S, pid) => !!(PL(S)[pid] && PL(S)[pid].bot);
    const wheelsOf = S => IP.normalizeWheels(S.wheels);
    const statOf = (S, pid) => (S.game.stats && S.game.stats[pid]) || {};
    const bump = (S, W, pid, key, n) => W.set(`game/stats/${pid}/${key}`, (statOf(S, pid)[key] || 0) + n);
    const activeId = S => arr(S.game.order)[S.game.turn];
    const onlineHumans = S => arr(S.game.order).filter(id => PL(S)[id] && !PL(S)[id].bot && PL(S)[id].online !== false);
    const botIds = S => arr(S.game.order).filter(id => isBot(S, id));

    function feed(S, W, now, text, who) {
      const key = 'f' + Math.floor(now).toString(36).padStart(9, '0') + (fk++ % 1296).toString(36).padStart(2, '0');
      const item = { t: text };
      if (who && who.length) item.w = who;
      W.set('game/feed/' + key, item);
      const keys = Object.keys(S.game.feed || {}).sort();
      if (keys.length > 28) keys.slice(0, keys.length - 28).forEach(k => W.set('game/feed/' + k, null));
    }

    function startGame(S, W, now) {
      const ids = Object.keys(PL(S));
      if (ids.length < 2) return;
      const order = shuffle(ids.slice());
      const deck = [];
      for (const s of SUITS) for (let r = 1; r <= 13; r++) deck.push({ r, s });
      shuffle(deck);
      const hands = {}, stats = {};
      order.forEach(id => {
        hands[id] = deck.splice(0, 4);
        stats[id] = { points: 0, shields: 0, taken: 0, given: 0, miniWins: 0 };
      });
      W.set('game', {
        key: Math.random().toString(36).slice(2, 10),
        order, hands, stats,
        round: 1, turn: 0, step: 'guess', stepAt: now, phase: 'turns', turnId: 1
      });
      W.set('status', 'playing');
      feed(S, W, now, 'Cards are dealt. Round 1: red or black?');
    }

    function addBot(S, W, now) {
      const ps = PL(S);
      if (Object.keys(ps).length >= MAX_PLAYERS) return;
      const used = Object.keys(ps).map(id => (ps[id].name || '').toLowerCase());
      const name = BOT_NAMES.find(n => used.indexOf(n.toLowerCase()) === -1) || ('Bot ' + (Object.keys(ps).length + 1));
      const pid = 'bot' + Math.random().toString(36).slice(2, 9);
      W.set('players/' + pid, { name, bot: true, skill: Math.round((0.2 + Math.random() * 0.7) * 100) / 100, online: true, joinedAt: now });
    }

    function resetTurnFields(W) { ['guess', 'outcome', 'slice', 'jitter', 'result'].forEach(k => W.set('game/' + k, null)); }

    function onGuess(S, W, from, g, now) {
      const G = S.game;
      if (!G || G.phase !== 'turns' || G.step !== 'guess') return;
      const pid = activeId(S);
      if (from !== pid || !rules.validGuess(G.round, g)) return;
      const outcome = rules.evaluate(G.hands[pid], G.round, g);
      W.set('game/guess', g);
      W.set('game/outcome', outcome);
      W.set('game/stepAt', now);
      if (outcome === 'social') {
        arr(G.order).forEach(q => bump(S, W, q, 'taken', 1));
        W.set('game/step', 'social');
        feed(S, W, now, `Everyone drank: same card on {{${pid}|poss}} turn`, arr(G.order));
      } else {
        if (outcome === 'correct') bump(S, W, pid, 'points', 1);
        W.set('game/slice', Math.floor(Math.random() * 8));
        W.set('game/jitter', Math.round(Math.random() * 24 - 12));
        W.set('game/step', 'spin');
      }
    }

    function done(W, now, result) {
      W.set('game/result', result);
      W.set('game/step', 'done');
      W.set('game/stepAt', now);
    }

    function applyTake(S, W, pid, sl) {
      const n = sl.type === 'drinks' ? sl.n : (sl.w || 0);
      if (n) bump(S, W, pid, 'taken', n);
    }

    function takeText(sl) { return sl.type === 'drinks' ? `take ${sl.n} drinks` : sl.take.charAt(0).toLowerCase() + sl.take.slice(1); }

    function resolve(S, W, now) {
      const G = S.game, pid = activeId(S);
      const sl = wheelsOf(S)[G.round - 1].slices[G.slice];
      const correct = G.outcome === 'correct';
      const t = sl.type;
      if (t === 'all') {
        arr(G.order).forEach(q => bump(S, W, q, 'taken', sl.n));
        feed(S, W, now, `Everyone drank${sl.n > 1 ? ' ×' + sl.n : ''} from {{${pid}|poss}} spin`, arr(G.order));
        return done(W, now, { t: 'all' });
      }
      if (t === 'group') { feed(S, W, now, `{{${pid}}} spun ${sl.label.toLowerCase()}: ${sl.text.charAt(0).toLowerCase() + sl.text.slice(1)}`); return done(W, now, { t: 'group' }); }
      if (t === 'none') { feed(S, W, now, `{{${pid}}} spun a free pass`, [pid]); return done(W, now, { t: 'none' }); }
      if (correct) {
        if (t === 'shield') {
          const st = statOf(S, pid);
          if ((st.shields || 0) < 2) { bump(S, W, pid, 'shields', 1); feed(S, W, now, `{{${pid}}} won a bonus Shield on the wheel`, [pid]); return done(W, now, { t: 'shield' }); }
          bump(S, W, pid, 'points', 1);
          feed(S, W, now, `{{${pid}}} got a bonus point (Shields full)`, [pid]);
          return done(W, now, { t: 'shield', full: true });
        }
        if (t === 'say') { feed(S, W, now, `{{${pid}}}: ${sl.give.charAt(0).toLowerCase() + sl.give.slice(1)}`, [pid]); return done(W, now, { t: 'say' }); }
        W.set('game/step', 'pick');
        W.set('game/stepAt', now);
        return;
      }
      if (t === 'shield') return done(W, now, { t: 'pass' });
      if ((statOf(S, pid).shields || 0) > 0) { W.set('game/step', 'shield'); W.set('game/stepAt', now); return; }
      applyTake(S, W, pid, sl);
      feed(S, W, now, `{{${pid}}}: ${takeText(sl)}`, [pid]);
      done(W, now, { t: 'take' });
    }

    function onPick(S, W, from, data, now) {
      const G = S.game;
      if (!G || G.phase !== 'turns' || G.step !== 'pick') return;
      const pid = activeId(S);
      if (from !== pid) return;
      const sl = wheelsOf(S)[G.round - 1].slices[G.slice];
      const others = arr(G.order).filter(q => q !== pid);
      if (sl.type === 'drinks') {
        const dist = data.dist || {};
        let total = 0;
        const clean = {};
        for (const id of Object.keys(dist)) {
          const n = Math.round(Number(dist[id]));
          if (others.indexOf(id) === -1 || !(n > 0)) return;
          clean[id] = n; total += n;
        }
        if (total !== sl.n) return;
        Object.keys(clean).forEach(id => bump(S, W, id, 'taken', clean[id]));
        bump(S, W, pid, 'given', total);
        const txt = Object.keys(clean).map(id => `{{${id}}} ×${clean[id]}`).join(', ');
        feed(S, W, now, `{{${pid}}} gave out ${total}: ${txt}`, [pid].concat(Object.keys(clean)));
        return done(W, now, { t: 'gave', dist: clean });
      }
      if (sl.type === 'pick') {
        const target = data.target;
        if (others.indexOf(target) === -1) return;
        if (sl.w) { bump(S, W, target, 'taken', sl.w); bump(S, W, pid, 'given', sl.w); }
        feed(S, W, now, `{{${target}}}: ${sl.done}`, [pid, target]);
        return done(W, now, { t: 'picked', target });
      }
    }

    function botPick(S, W, now) {
      const G = S.game, pid = activeId(S);
      const sl = wheelsOf(S)[G.round - 1].slices[G.slice];
      const others = arr(G.order).filter(q => q !== pid);
      if (sl.type === 'drinks') {
        const dist = {};
        for (let i = 0; i < sl.n; i++) { const q = others[Math.floor(Math.random() * others.length)]; dist[q] = (dist[q] || 0) + 1; }
        onPick(S, W, pid, { dist }, now);
      } else {
        onPick(S, W, pid, { target: others[Math.floor(Math.random() * others.length)] }, now);
      }
    }

    function onShield(S, W, from, use, now) {
      const G = S.game;
      if (!G || G.phase !== 'turns' || G.step !== 'shield') return;
      const pid = activeId(S);
      if (from !== pid) return;
      const sl = wheelsOf(S)[G.round - 1].slices[G.slice];
      if (use && (statOf(S, pid).shields || 0) > 0) {
        bump(S, W, pid, 'shields', -1);
        feed(S, W, now, `{{${pid}}} used a Shield to skip: ${takeText(sl)}`, [pid]);
        return done(W, now, { t: 'take', blocked: true });
      }
      applyTake(S, W, pid, sl);
      feed(S, W, now, `{{${pid}}}: ${takeText(sl)}`, [pid]);
      done(W, now, { t: 'take' });
    }

    function onSkip(S, W, now) {
      const G = S.game;
      if (!G || G.phase !== 'turns') return;
      const pid = activeId(S);
      if (G.step === 'guess' || G.step === 'pick' || G.step === 'spin') {
        if (G.step === 'guess') W.set('game/outcome', 'skipped');
        feed(S, W, now, `{{${pid}|poss}} turn was skipped`, [pid]);
        return done(W, now, { t: 'skipped' });
      }
      if (G.step === 'shield') return onShield(S, W, pid, false, now);
      if (G.step === 'done' || G.step === 'social') return advance(S, W, now);
    }

    function advance(S, W, now) {
      const G = S.game;
      if (G.turn + 1 < arr(G.order).length) {
        W.set('game/turn', G.turn + 1);
        W.set('game/step', 'guess');
        W.set('game/stepAt', now);
        W.set('game/turnId', (G.turnId || 0) + 1);
        resetTurnFields(W);
      } else {
        miniIntro(S, W, now);
      }
    }

    function onNext(S, W, from, host, now) {
      const G = S.game;
      if (!G || G.phase !== 'turns' || (G.step !== 'done' && G.step !== 'social')) return;
      if (from !== activeId(S) && !host) return;
      advance(S, W, now);
    }

    function miniIntro(S, W, now) {
      const G = S.game;
      const used = arr(G.minisUsed);
      const pool = IP.MINI_ORDER.filter(id => used.indexOf(id) === -1);
      const id = pool.length ? pool[Math.floor(Math.random() * pool.length)] : IP.MINI_ORDER[Math.floor(Math.random() * IP.MINI_ORDER.length)];
      W.set('game/minisUsed', used.concat([id]));
      const ready = {};
      botIds(S).forEach(b => { ready[b] = true; });
      const mini = { round: G.round, gameId: id, seed: Math.floor(Math.random() * 2147483647), prize: G.round < 4 ? 'shield' : 'point' };
      if (Object.keys(ready).length) mini.ready = ready;
      W.set('game/mini', mini);
      W.set('game/phase', 'mini-intro');
      W.set('game/step', 'idle');
      W.set('game/stepAt', now);
      resetTurnFields(W);
    }

    function miniStart(S, W, now) {
      const G = S.game;
      if (!G || G.phase !== 'mini-intro') return;
      const M = IP.MINI_META[G.mini.gameId];
      const startAt = now + ts(3600);
      const endAt = M.dur ? startAt + ts(M.dur) : 0;
      const capAt = M.dur ? endAt + ts(3500) : startAt + ts(M.cap);
      const data = M.setup ? M.setup(IP.mulberry32(G.mini.seed)) : null;
      const botFinal = {};
      botIds(S).forEach(b => { botFinal[b] = M.bot(PL(S)[b].skill || 0.5, Math.random, data); });
      W.set('game/mini/startAt', startAt);
      if (endAt) W.set('game/mini/endAt', endAt);
      W.set('game/mini/capAt', capAt);
      if (Object.keys(botFinal).length) W.set('game/mini/botFinal', botFinal);
      W.set('game/phase', 'mini-play');
    }

    function miniTick(S, W, now) {
      const G = S.game, mini = G.mini, M = IP.MINI_META[mini.gameId];
      const bf = mini.botFinal || {};
      if (M.live && mini.endAt && now >= mini.startAt && now <= mini.endAt + 200) {
        const frac = Math.max(0, Math.min(1, (now - mini.startAt) / (mini.endAt - mini.startAt)));
        Object.keys(bf).forEach((b, i) => {
          const v = Math.round(bf[b].score * Math.max(0, Math.min(1, frac * (0.85 + (i % 4) * 0.06))));
          if (!mini.live || mini.live[b] !== v) W.set(`game/mini/live/${b}`, v);
        });
      }
      const scores = mini.scores || {};
      const humans = onlineHumans(S);
      const allDone = humans.every(h => scores[h] && scores[h].done);
      if (now >= mini.capAt || (now >= mini.startAt + ts(1500) && allDone)) miniFinish(S, W, now);
    }

    function miniFinish(S, W, now) {
      const G = S.game, mini = G.mini, M = IP.MINI_META[mini.gameId];
      const bf = mini.botFinal || {}, scores = mini.scores || {};
      const rows = arr(G.order).map(pid => {
        const s = isBot(S, pid) ? bf[pid] : scores[pid];
        return (s && typeof s.score === 'number' && isFinite(s.score))
          ? { pid, score: s.score, tb: s.tb || 0, extra: s.extra || 0, rk: Math.random() }
          : { pid, missing: true, rk: Math.random() };
      });
      const valid = rows.filter(r => !r.missing).sort((a, b) => IP.miniCompare(M, a, b) || (a.rk - b.rk));
      const missing = rows.filter(r => r.missing);
      let prizeKind = 'none';
      if (valid.length) {
        const w = valid[0].pid;
        W.set('game/mini/winner', w);
        if (valid.length > 1 && IP.miniCompare(M, valid[0], valid[1]) === 0) W.set('game/mini/tie', true);
        bump(S, W, w, 'miniWins', 1);
        if (mini.prize === 'shield' && (statOf(S, w).shields || 0) < 2) { bump(S, W, w, 'shields', 1); prizeKind = 'shield'; }
        else { bump(S, W, w, 'points', 1); prizeKind = mini.prize === 'shield' ? 'point-full' : 'point'; }
        feed(S, W, now, `{{${w}}} won ${M.name}`, [w]);
      }
      W.set('game/mini/prizeKind', prizeKind);
      W.set('game/mini/results', valid.concat(missing).map(r => r.missing ? { pid: r.pid, missing: true } : { pid: r.pid, score: r.score, tb: r.tb, extra: r.extra }));
      W.set('game/phase', 'mini-results');
      W.set('game/stepAt', now);
    }

    function miniContinue(S, W, now) {
      const G = S.game;
      if (!G || G.phase !== 'mini-results') return;
      if (G.round < 4) {
        const r = G.round + 1;
        W.set('game/round', r);
        W.set('game/turn', 0);
        W.set('game/step', 'guess');
        W.set('game/stepAt', now);
        W.set('game/turnId', (G.turnId || 0) + 1);
        W.set('game/phase', 'turns');
        resetTurnFields(W);
        feed(S, W, now, `Round ${r}: ${['', 'red or black', 'higher or lower', 'in between or outside', 'guess the suit'][r]}`);
      } else {
        endGame(S, W, now);
      }
    }

    function endGame(S, W, now) {
      W.set('game/phase', 'end');
      W.set('game/stepAt', now);
      W.set('status', 'ended');
    }

    function handle(S, W, it, now) {
      if (!it || !it.type) return;
      const host = it.from === S.hostId;
      const d = it.data || {};
      switch (it.type) {
        case 'start': if (host && S.status === 'lobby') startGame(S, W, now); break;
        case 'addBot': if (host && S.status === 'lobby') addBot(S, W, now); break;
        case 'removePlayer': if (host && S.status === 'lobby' && d.pid && d.pid !== S.hostId) W.set('players/' + d.pid, null); break;
        case 'guess': if (S.game) onGuess(S, W, it.from, d.g, now); break;
        case 'pick': if (S.game) onPick(S, W, it.from, d, now); break;
        case 'shield': if (S.game) onShield(S, W, it.from, !!d.use, now); break;
        case 'next': if (S.game) onNext(S, W, it.from, host, now); break;
        case 'skip': if (host && S.game) onSkip(S, W, now); break;
        case 'miniStart': if (host && S.game) miniStart(S, W, now); break;
        case 'miniContinue': if (host && S.game) miniContinue(S, W, now); break;
        case 'playAgain': if (host && S.status === 'ended') startGame(S, W, now); break;
        case 'toLobby': if (host) { W.set('status', 'lobby'); W.set('game', null); } break;
        case 'endGame': if (host && S.status === 'playing' && S.game) endGame(S, W, now); break;
      }
    }

    function step(S, W, now) {
      const G = S.game;
      if (!G) return;
      if (G.phase === 'turns') {
        const pid = activeId(S);
        const p = PL(S)[pid];
        if (!p) { // player left: skip them
          if (G.step === 'done' || G.step === 'social') advance(S, W, now); else onSkip(S, W, now);
          return;
        }
        const bot = !!p.bot, el = now - G.stepAt;
        if (G.step === 'guess' && bot && el >= ts(1500)) onGuess(S, W, pid, rules.botGuess(G.hands[pid], G.round), now);
        else if (G.step === 'spin' && el >= ts(SPIN_MS)) resolve(S, W, now);
        else if (G.step === 'pick' && bot && el >= ts(1300)) botPick(S, W, now);
        else if (G.step === 'shield' && bot && el >= ts(1200)) onShield(S, W, pid, Math.random() < 0.65, now);
        else if ((G.step === 'done' || G.step === 'social') && el >= ts(bot ? 3400 : 20000)) advance(S, W, now);
        else if (!bot && p.online === false && (G.step === 'guess' || G.step === 'pick' || G.step === 'shield') && el >= ts(30000)) onSkip(S, W, now);
      } else if (G.phase === 'mini-intro') {
        const humans = onlineHumans(S), ready = (G.mini && G.mini.ready) || {};
        if (humans.every(h => ready[h])) miniStart(S, W, now);
      } else if (G.phase === 'mini-play') {
        miniTick(S, W, now);
      }
    }

    async function tick() {
      if (working || stopped) return;
      working = true;
      try {
        const S = await db.get(base);
        if (!S || S.hostId !== myPid) return;
        const now = db.now();
        const W = writer(S);
        const inbox = S.inbox || {};
        const keys = Object.keys(inbox).sort();
        for (const k of keys) {
          const it = inbox[k];
          W.set('inbox/' + k, null);
          if (seen.has(k)) continue;
          seen.add(k);
          handle(S, W, it, now);
        }
        if (S.status === 'playing') step(S, W, now);
        if (Object.keys(W.up).length) await db.update(base, W.up);
      } catch (e) {
        console.error('Host engine error', e);
      } finally {
        working = false;
      }
    }

    return {
      start() { if (!stopped) return; stopped = false; iv = setInterval(tick, Math.max(20, ts(250))); tick(); },
      stop() { stopped = true; clearInterval(iv); },
      poke() { tick(); }
    };
  };
})(window.IP = window.IP || {});
