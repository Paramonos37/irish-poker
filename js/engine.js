// The host engine. It runs only on the host's phone: it reads the room, applies everyone's
// requests, moves the game along on timers and plays for the bots. Every other phone sends
// taps and draws whatever the room says.
//
// Everything interactive (wheel games and mini games) is an "act" at game.act. Each act opens
// with a ready check that waits for every player, then runs its own stages, then a Shield
// check for anyone who has to drink, then a results screen.
(function (IP) {
  'use strict';
  const SUITS = ['h', 'd', 'c', 's'];
  const isRed = s => s === 'h' || s === 'd';
  const ts = ms => ms * (IP.TIME_SCALE || 1);
  const SPIN_MS = 3800, LAND_MS = 2600;
  const BOT_NAMES = ['Jake', 'Mia', 'Tyler', 'Ava', 'Marcus', 'Jess', 'Nate', 'Kayla', 'Sam', 'Riley', 'Owen', 'Zoe'];
  const MAX_PLAYERS = 12;
  IP.SPIN_MS = SPIN_MS;
  IP.LAND_MS = LAND_MS;
  IP.MAX_PLAYERS = MAX_PLAYERS;
  IP.GATE_STAGES = { intro: true, card: true };

  const clone = v => (v === undefined || v === null) ? v : JSON.parse(JSON.stringify(v));
  const arr = v => Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.keys(v).sort((a, b) => a - b).map(k => v[k]) : []);
  IP.arr = arr;
  const rnd = n => Math.floor(Math.random() * n);
  const pick = a => a[rnd(a.length)];
  const pickOther = (list, not) => { const l = list.filter(x => x !== not); return l.length ? pick(l) : null; };
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function hash(s) { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function gauss() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

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
      return SUITS[rnd(4)];
    },
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

  // Price slider mapping, shared with the phones: more precision at low prices.
  IP.priceFromT = t => Math.round(1 + 9999 * Math.pow(clamp(t, 0, 1), 2.5));
  IP.tFromPrice = c => Math.pow(clamp((c - 1) / 9999, 0, 1), 1 / 2.5);

  // Collects changes as one multi-path update while keeping the local copy current.
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
    const pendingTx = new Set();

    const PL = S => S.players || {};
    const isBot = (S, pid) => !!(PL(S)[pid] && PL(S)[pid].bot);
    const online = (S, pid) => { const p = PL(S)[pid]; return !!p && (p.bot || p.online !== false); };
    const humansOn = (S, ids) => ids.filter(id => PL(S)[id] && !PL(S)[id].bot && PL(S)[id].online !== false);
    const order = S => arr(S.game.order).filter(id => PL(S)[id]);
    const statOf = (S, pid) => (S.game.stats && S.game.stats[pid]) || {};
    const bump = (S, W, pid, key, n) => W.set(`game/stats/${pid}/${key}`, (statOf(S, pid)[key] || 0) + n);
    const activeId = S => arr(S.game.order)[S.game.turn];
    const skill = (S, pid) => (PL(S)[pid] && PL(S)[pid].skill) || 0.5;
    const nm = id => `{{${id}}}`;

    function feed(S, W, now, text, who) {
      const key = 'f' + Math.floor(now).toString(36).padStart(9, '0') + (fk++ % 1296).toString(36).padStart(2, '0');
      const item = { t: text };
      if (who && who.length) item.w = who;
      W.set('game/feed/' + key, item);
      const keys = Object.keys(S.game.feed || {}).sort();
      if (keys.length > 28) keys.slice(0, keys.length - 28).forEach(k => W.set('game/feed/' + k, null));
    }
    function add(items, pid, n, why, ns) {
      if (!pid || !(n > 0)) return;
      const it = items[pid] || { n: 0, why: '' };
      it.n += n;
      it.why = it.why ? it.why + ' + ' + why : why;
      if (ns) it.ns = 1;
      items[pid] = it;
    }

    /* ---------- game setup ---------- */
    function startGame(S, W, now) {
      const ids = Object.keys(PL(S));
      if (ids.length < 2) return;
      const ord = shuffle(ids.slice());
      const deck = [];
      for (const s of SUITS) for (let r = 1; r <= 13; r++) deck.push({ r, s });
      shuffle(deck);
      const hands = {}, stats = {};
      ord.forEach(id => {
        hands[id] = deck.splice(0, 4);
        stats[id] = { points: 0, shields: 0, taken: 0, given: 0, miniWins: 0, champ: 0 };
      });
      W.set('game', {
        key: Math.random().toString(36).slice(2, 10),
        order: ord, hands, stats, miniOrder: shuffle(IP.MINI_KINDS.slice()),
        round: 1, turn: 0, step: 'guess', stepAt: now, phase: 'turns', turnId: 1, sidc: 0, penc: 0
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

    /* ---------- Shields: anyone about to drink can block it ---------- */
    function startPen(S, W, now, items, ctx) {
      const id = (S.game.penc || 0) + 1;
      W.set('game/penc', id);
      const ask = {}, bot = {};
      Object.keys(items).forEach(pid => {
        const it = items[pid];
        if (!(it.n > 0) || it.ns || !PL(S)[pid]) return;
        if ((statOf(S, pid).shields || 0) <= 0) return;
        if (isBot(S, pid)) bot[pid] = (it.n >= 3 || Math.random() < 0.5) ? 'use' : 'take';
        else if (PL(S)[pid].online !== false) ask[pid] = true;
      });
      const pen = { id, ctx, items, at: now, until: now + ts(20000) };
      if (Object.keys(ask).length) pen.ask = ask;
      if (Object.keys(bot).length) pen.bot = bot;
      W.set('game/pen', pen);
      W.set('game/pendec', null);
      if (!pen.ask) resolvePen(S, W, now);
    }
    function penTick(S, W, now) {
      const pen = S.game.pen;
      if (!pen || pen.out) return;
      const dec = (S.game.pendec && S.game.pendec[pen.id]) || {};
      const waiting = Object.keys(pen.ask || {}).filter(pid => !dec[pid] && PL(S)[pid] && PL(S)[pid].online !== false);
      if (!waiting.length || now >= pen.until) resolvePen(S, W, now);
    }
    function resolvePen(S, W, now) {
      const pen = S.game.pen;
      const dec = Object.assign({}, pen.bot || {}, (S.game.pendec && S.game.pendec[pen.id]) || {});
      const out = {};
      Object.keys(pen.items || {}).forEach(pid => {
        const it = pen.items[pid];
        const blocked = !it.ns && dec[pid] === 'use' && (statOf(S, pid).shields || 0) > 0 && it.n > 0;
        if (blocked) { bump(S, W, pid, 'shields', -1); feed(S, W, now, `${nm(pid)} used a Shield to skip ${it.n} drink${it.n === 1 ? '' : 's'}`, [pid]); }
        else if (it.n > 0) bump(S, W, pid, 'taken', it.n);
        out[pid] = { n: it.n, why: it.why || '', b: blocked ? 1 : 0 };
      });
      W.set('game/pen/out', out);
      W.set('game/pen/done', 1);
      W.set('game/pendec', null);
      afterPen(S, W, now);
    }
    function afterPen(S, W, now) {
      const G = S.game;
      if (G.act && G.act.stage === 'pen') { applyPrize(S, W, now); setStage(S, W, now, 'done', 0); }
      else if (G.phase === 'turns' && G.step === 'pen') { W.set('game/step', 'done'); W.set('game/stepAt', now); }
    }

    /* ---------- turns ---------- */
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
        feed(S, W, now, `Same card on ${nm(pid)}|poss turn: everyone drinks`.replace(`${nm(pid)}|poss`, `{{${pid}|poss}}`), order(S));
        const items = {};
        order(S).forEach(q => add(items, q, 1, 'Social'));
        W.set('game/step', 'pen');
        startPen(S, W, now, items, 'social');
        return;
      }
      if (outcome === 'correct') bump(S, W, pid, 'points', 1);
      W.set('game/slice', rnd(8));
      W.set('game/jitter', Math.round(Math.random() * 24 - 12));
      W.set('game/step', 'spin');
    }
    const curSlice = S => IP.wheelFor(S.game.round).slices[S.game.slice];

    function resolveSpin(S, W, now) {
      const G = S.game, pid = activeId(S), sl = curSlice(S);
      if (sl.type === 'drinks') {
        if (G.outcome === 'correct') { W.set('game/step', 'pick'); W.set('game/stepAt', now); return; }
        feed(S, W, now, `${nm(pid)} has to take ${sl.n}`, [pid]);
        W.set('game/result', { t: 'take', n: sl.n });
        W.set('game/step', 'pen');
        W.set('game/stepAt', now);
        const items = {};
        add(items, pid, sl.n, 'Wrong guess');
        startPen(S, W, now, items, 'take');
        return;
      }
      W.set('game/step', 'act');
      W.set('game/stepAt', now);
      createAct(S, W, now, sl.type, 'slice');
    }

    function onPick(S, W, from, data, now) {
      const G = S.game;
      if (!G || G.phase !== 'turns' || G.step !== 'pick') return;
      const pid = activeId(S);
      if (from !== pid) return;
      const sl = curSlice(S);
      const others = order(S).filter(q => q !== pid);
      const dist = (data && data.dist) || {};
      let total = 0;
      const clean = {};
      for (const id of Object.keys(dist)) {
        const n = Math.round(Number(dist[id]));
        if (others.indexOf(id) === -1 || !(n > 0)) return;
        clean[id] = n; total += n;
      }
      if (total !== sl.n) return;
      bump(S, W, pid, 'given', total);
      feed(S, W, now, `${nm(pid)} gave out ${total}: ${Object.keys(clean).map(id => `${nm(id)} ×${clean[id]}`).join(', ')}`, [pid].concat(Object.keys(clean)));
      W.set('game/result', { t: 'gave', dist: clean });
      W.set('game/step', 'pen');
      W.set('game/stepAt', now);
      const items = {};
      Object.keys(clean).forEach(id => add(items, id, clean[id], 'from ' + nm(pid)));
      startPen(S, W, now, items, 'give');
    }
    function botPick(S, W, now) {
      const pid = activeId(S), sl = curSlice(S);
      const others = order(S).filter(q => q !== pid);
      const dist = {};
      for (let i = 0; i < sl.n; i++) { const q = pick(others); dist[q] = (dist[q] || 0) + 1; }
      onPick(S, W, pid, { dist }, now);
    }
    function skipTurn(S, W, now) {
      const G = S.game, pid = activeId(S);
      if (G.step === 'guess') W.set('game/outcome', 'skipped');
      W.set('game/result', { t: 'skipped' });
      feed(S, W, now, `{{${pid}|poss}} turn was skipped`, [pid]);
      W.set('game/step', 'done');
      W.set('game/stepAt', now);
    }
    function clearTurn(W) {
      ['guess', 'outcome', 'slice', 'jitter', 'result', 'pen', 'pendec', 'act', 'ain', 'ardy', 'bomb', 'live'].forEach(k => W.set('game/' + k, null));
    }
    function advance(S, W, now) {
      const G = S.game;
      clearTurn(W);
      if (G.turn + 1 < arr(G.order).length) {
        W.set('game/turn', G.turn + 1);
        W.set('game/step', 'guess');
        W.set('game/stepAt', now);
        W.set('game/turnId', (G.turnId || 0) + 1);
      } else startMini(S, W, now);
    }
    function onNext(S, W, from, host, now) {
      const G = S.game;
      if (!G || G.phase !== 'turns') return;
      const doneish = G.step === 'done' || (G.step === 'act' && G.act && G.act.stage === 'done');
      if (!doneish) return;
      if (from !== activeId(S) && !host) return;
      advance(S, W, now);
    }

    /* ---------- mini games ---------- */
    function startMini(S, W, now) {
      const G = S.game;
      const kinds = arr(G.miniOrder).length ? arr(G.miniOrder) : IP.MINI_KINDS;
      const kind = kinds[(G.round - 1) % kinds.length];
      W.set('game/phase', 'mini');
      W.set('game/step', 'idle');
      W.set('game/stepAt', now);
      feed(S, W, now, `Mini game: ${IP.ACT_INFO[kind].name}`);
      createAct(S, W, now, kind, 'mini');
    }
    function miniContinue(S, W, now) {
      const G = S.game;
      if (!G || G.phase !== 'mini' || !G.act || G.act.stage !== 'done') return;
      clearTurn(W);
      if (G.round < 4) {
        const r = G.round + 1;
        W.set('game/round', r);
        W.set('game/turn', 0);
        W.set('game/step', 'guess');
        W.set('game/stepAt', now);
        W.set('game/turnId', (G.turnId || 0) + 1);
        W.set('game/phase', 'turns');
        feed(S, W, now, `Round ${r}: ${IP.ROUND_NAMES[r].toLowerCase()}`);
      } else endGame(S, W, now);
    }
    function endGame(S, W, now) {
      clearTurn(W);
      W.set('game/phase', 'end');
      W.set('game/stepAt', now);
      W.set('status', 'ended');
    }

    /* ---------- acts (wheel games and mini games) ---------- */
    function newSid(S, W) { const n = (S.game.sidc || 0) + 1; W.set('game/sidc', n); return n; }
    function setStage(S, W, now, stage, dur) {
      const sid = newSid(S, W);
      W.set('game/act/stage', stage);
      W.set('game/act/sid', sid);
      W.set('game/act/at', now);
      W.set('game/act/until', dur ? now + ts(dur) : 0);
      return sid;
    }
    const inputs = S => (S.game.ain && S.game.act && S.game.ain[S.game.act.sid]) || {};
    function botInputs(S, W, now, ids, chooser, minMs, maxMs) {
      const A = S.game.act;
      if (!S.game.ain || !S.game.ain[A.sid]) W.set(`game/ain/${A.sid}/_`, 1);
      const inp = inputs(S);
      ids.forEach(id => {
        if (!isBot(S, id) || inp[id] !== undefined) return;
        const delay = ts(minMs + hash(A.sid + ':' + id) % Math.max(1, maxMs - minMs));
        if (now - A.at >= delay) W.set(`game/ain/${A.sid}/${id}`, chooser(id));
      });
    }
    // True once every bot and every online human in ids has an input that passes ok().
    function allIn(S, ids, ok) {
      const inp = inputs(S);
      ok = ok || (v => v !== undefined && v !== null);
      return ids.every(id => (!isBot(S, id) && !online(S, id)) || ok(inp[id]));
    }
    const pastDeadline = (S, now) => S.game.act.until && now >= S.game.act.until + ts(1500);

    function createAct(S, W, now, kind, ctx) {
      const G = S.game, all = order(S);
      const A = { kind, ctx, round: G.round, d: {} };
      if (ctx === 'slice') {
        A.sp = activeId(S);
        A.right = G.outcome === 'correct' ? 1 : 0;
        if (A.right) A.imm = A.sp;
      } else {
        A.prize = G.round < 4 ? 'shield' : 'brag';
      }
      const ok = K[kind].init(S, W, now, A, all);
      W.set('game/act', A);
      W.set('game/ain', null);
      W.set('game/ardy', null);
      W.set('game/bomb', null);
      W.set('game/live', null);
      if (ok === false) { finishAct(S, W, now, { skip: 'Not enough players for this one, so it’s skipped.' }, {}, []); return; }
      setStage(S, W, now, 'intro', 0);
    }
    function finishAct(S, W, now, res, items, winners) {
      const A = S.game.act;
      items = items || {};
      if (A.ctx === 'slice' && !A.right && A.sp) add(items, A.sp, 1, 'Wrong guess');
      W.set('game/act/res', res || {});
      if (winners && winners.length) W.set('game/act/win', winners);
      setStage(S, W, now, 'pen', 0);
      startPen(S, W, now, items, 'act');
    }
    function applyPrize(S, W, now) {
      const A = S.game.act;
      if (!A || A.ctx !== 'mini') return;
      const name = IP.ACT_INFO[A.kind].name;
      arr(A.win).forEach(w => {
        if (!PL(S)[w]) return;
        bump(S, W, w, 'miniWins', 1);
        if (A.prize === 'shield') { bump(S, W, w, 'shields', 1); feed(S, W, now, `${nm(w)} won ${name} and a Shield`, [w]); }
        else { bump(S, W, w, 'champ', 1); feed(S, W, now, `${nm(w)} won the final mini game, ${name}`, [w]); }
      });
    }
    function gateReady(S) {
      const A = S.game.act;
      const rd = (S.game.ardy && S.game.ardy[A.sid]) || {};
      return humansOn(S, order(S)).every(id => rd[id]);
    }
    function tickAct(S, W, now) {
      const A = S.game.act;
      if (!A || !A.stage) return;
      if (A.stage === 'pen') { penTick(S, W, now); return; }
      if (A.stage === 'done') {
        if (A.ctx === 'slice') {
          const bot = isBot(S, A.sp);
          if (now - A.at >= ts(bot ? 6500 : 45000)) advance(S, W, now);
        }
        return;
      }
      if (IP.GATE_STAGES[A.stage]) {
        if (A.force === A.sid || gateReady(S)) K[A.kind].next(S, W, now, A.stage);
        return;
      }
      K[A.kind].tick(S, W, now);
    }

    /* ---------- hot potato and live auction use transactions ---------- */
    function tx(key, path, fn) {
      if (pendingTx.has(key)) return;
      pendingTx.add(key);
      db.transaction(base + '/' + path, cur => (cur === null || cur === undefined) ? null : fn(cur))
        .catch(e => console.error(e))
        .then(() => pendingTx.delete(key));
    }

    const K = {};

    K.vote = {
      init(S, W, now, A, all) {
        A.voters = all;
        A.cands = all.filter(id => id !== A.imm);
        if (A.cands.length < 2) return false;
        A.d.prompt = pick(IP.VOTE_PROMPTS);
      },
      next(S, W, now) { setStage(S, W, now, 'vote', 10000); },
      tick(S, W, now) {
        const A = S.game.act, cands = arr(A.cands), voters = arr(A.voters);
        botInputs(S, W, now, voters, id => pickOther(cands, id), 1500, 7500);
        if (!(allIn(S, voters, v => typeof v === 'string') || pastDeadline(S, now))) return;
        const inp = inputs(S), counts = {};
        cands.forEach(c => { counts[c] = 0; });
        voters.forEach(v => { const t = inp[v]; if (typeof t === 'string' && counts[t] !== undefined && t !== v) counts[t]++; });
        const max = Math.max(0, ...Object.keys(counts).map(k => counts[k]));
        const losers = max > 0 ? cands.filter(c => counts[c] === max) : [];
        const items = {};
        losers.forEach(l => add(items, l, IP.ACT_DRINKS[A.round], 'Most votes'));
        if (losers.length) feed(S, W, now, `Phone vote: ${losers.map(nm).join(', ')} got the most votes`, losers);
        finishAct(S, W, now, { counts, losers, voted: voters.filter(v => typeof inp[v] === 'string').length }, items);
      }
    };

    K.potato = {
      init(S, W, now, A, all) {
        A.pl = all;
        A.targets = all.filter(id => id !== A.imm);
        if (A.targets.length < 2) return false;
        A.start = A.sp || pick(all);
      },
      next(S, W, now) {
        const A = S.game.act;
        setStage(S, W, now, 'live', 0);
        W.set('game/act/fuse', now + ts(10000 + Math.random() * 15000));
        W.set('game/bomb', { h: A.start, k: 0, at: now });
      },
      tick(S, W, now) {
        const A = S.game.act, B = S.game.bomb, targets = arr(A.targets);
        if (A.stage === 'live') {
          if (!B) return;
          if (now >= A.fuse) {
            let loser = B.h;
            if (loser === A.imm || targets.indexOf(loser) === -1) loser = pick(targets);
            W.set('game/act/loser', loser);
            W.set('game/act/passes', B.k || 0);
            setStage(S, W, now, 'boom', 0);
            return;
          }
          const held = now - (B.at || A.at), h = B.h;
          const p = PL(S)[h];
          const auto = (isBot(S, h) && held >= ts(700 + hash(A.sid + ':' + B.k) % 1900))
            || (h === A.imm && held >= ts(5000))
            || (!!p && !p.bot && p.online === false && held >= ts(2500))
            || !p;
          if (auto) {
            const to = pickOther(targets, h), k = B.k;
            tx('bomb:' + A.sid + ':' + k, 'game/bomb', cur => (cur.h === h && cur.k === k) ? { h: to, k: k + 1, at: db.now() } : undefined);
          }
        } else if (A.stage === 'boom' && now - A.at >= ts(3000)) {
          const items = {};
          add(items, A.loser, IP.ACT_DRINKS[A.round], 'Held the bomb');
          feed(S, W, now, `Hot potato blew up on ${nm(A.loser)}`, [A.loser]);
          finishAct(S, W, now, { loser: A.loser, passes: A.passes || 0 }, items);
        }
      }
    };

    K.trap = {
      init(S, W, now, A, all) { A.pl = all.filter(id => id !== A.imm); if (!A.pl.length) return false; },
      next(S, W, now) { setStage(S, W, now, 'pick', 10000); },
      tick(S, W, now) {
        const A = S.game.act, pl = arr(A.pl);
        if (A.stage === 'pick') {
          botInputs(S, W, now, pl, () => 1 + rnd(4), 1200, 6500);
          if (!(allIn(S, pl, v => v >= 1 && v <= 4) || pastDeadline(S, now))) return;
          const inp = inputs(S), doors = {};
          pl.forEach(id => {
            const v = inp[id];
            if (v >= 1 && v <= 4) doors[id] = v;
            else if (online(S, id)) doors[id] = 1 + rnd(4);
          });
          W.set('game/act/trap', 1 + rnd(4));
          W.set('game/act/doors', doors);
          setStage(S, W, now, 'reveal', 0);
        } else if (A.stage === 'reveal' && now - A.at >= ts(4800)) {
          const doors = A.doors || {}, fell = Object.keys(doors).filter(id => doors[id] === A.trap);
          const items = {};
          fell.forEach(id => add(items, id, IP.ACT_DRINKS[A.round], 'Fell through the trapdoor'));
          if (fell.length) feed(S, W, now, `Trapdoor: ${fell.map(nm).join(', ')} fell through`, fell);
          finishAct(S, W, now, { trap: A.trap, doors, fell }, items);
        }
      }
    };

    K.chairs = {
      init(S, W, now, A, all) {
        A.pl = all.filter(id => id !== A.imm);
        if (A.pl.length < 2) return false;
        A.d.n = A.pl.length - 1;
        A.d.seed = rnd(1e9);
      },
      next(S, W, now) {
        setStage(S, W, now, 'go', 0);
        W.set('game/act/go', now + ts(3600));
        W.set('game/act/until', now + ts(3600 + 6000));
      },
      tick(S, W, now) {
        const A = S.game.act, pl = arr(A.pl);
        if (now < A.go) return;
        const inp = inputs(S);
        if (!S.game.ain || !S.game.ain[A.sid]) W.set(`game/ain/${A.sid}/_`, 1);
        pl.forEach(id => {
          if (!isBot(S, id) || inp[id] !== undefined) return;
          const ms = Math.round(280 + (1 - skill(S, id)) * 420 + hash(A.sid + id) % 260);
          if (now >= A.go + ts(ms)) W.set(`game/ain/${A.sid}/${id}`, { ms });
        });
        const has = v => v && typeof v.ms === 'number';
        if (!(allIn(S, pl, has) || now >= A.until)) return;
        const tapped = pl.filter(id => has(inp[id])).sort((a, b) => inp[a].ms - inp[b].ms);
        let standing = pl.filter(id => !has(inp[id]) && online(S, id));
        if (!standing.length && tapped.length >= 2) standing = [tapped[tapped.length - 1]];
        const items = {};
        standing.forEach(id => add(items, id, IP.ACT_DRINKS[A.round], 'Left standing'));
        if (standing.length) feed(S, W, now, `Musical chairs: ${standing.map(nm).join(', ')} got left standing`, standing);
        finishAct(S, W, now, { order: tapped.map(id => ({ id, ms: Math.round(inp[id].ms) })), standing }, items);
      }
    };

    K.odd = {
      init(S, W, now, A, all) {
        A.pl = all.filter(id => id !== A.imm);
        if (A.pl.length < 2) return false;
        A.d.q = pick(IP.ODD_PAIRS);
      },
      next(S, W, now) { setStage(S, W, now, 'pick', 10000); },
      tick(S, W, now) {
        const A = S.game.act, pl = arr(A.pl);
        botInputs(S, W, now, pl, () => (Math.random() < 0.5 ? 'a' : 'b'), 1200, 7000);
        const ok = v => v === 'a' || v === 'b';
        if (!(allIn(S, pl, ok) || pastDeadline(S, now))) return;
        const inp = inputs(S), picks = {};
        pl.forEach(id => { if (ok(inp[id])) picks[id] = inp[id]; else if (online(S, id)) picks[id] = Math.random() < 0.5 ? 'a' : 'b'; });
        const ids = Object.keys(picks);
        const ga = ids.filter(id => picks[id] === 'a'), gb = ids.filter(id => picks[id] === 'b');
        let losers = [], why = '';
        if (!ga.length || !gb.length) { why = 'all'; }
        else if (ga.length === gb.length) { losers = ids; why = 'even'; }
        else { losers = ga.length < gb.length ? ga : gb; why = 'minority'; }
        const items = {};
        losers.forEach(id => add(items, id, IP.ACT_DRINKS[A.round], why === 'even' ? 'Even split' : 'Odd one out'));
        finishAct(S, W, now, { picks, why, losers }, items);
      }
    };

    /* Auction: secret bids of 0-5 drinks for the prize (or live bidding) */
    const botBid = (S, id) => clamp(Math.round(Math.random() * (1.5 + skill(S, id) * 3)), 0, 5);
    K.auction = {
      init(S, W, now, A, all) {
        A.pl = all;
        if (all.length < 2) return false;
        const r = Math.random();
        A.d.twist = r < 0.45 ? 'sealed' : (r < 0.85 ? 'live' : 'allpay');
      },
      next(S, W, now) {
        const A = S.game.act;
        if (A.d.twist === 'live') {
          setStage(S, W, now, 'live', 0);
          W.set('game/live', { h: 0, by: '', at: now, k: 0 });
        } else setStage(S, W, now, 'bid', 12000);
      },
      tick(S, W, now) {
        const A = S.game.act;
        if (A.stage === 'bid' || A.stage === 'rebid') return this.sealed(S, W, now);
        if (A.stage === 'live') return this.live(S, W, now);
      },
      sealed(S, W, now) {
        const A = S.game.act, re = A.stage === 'rebid';
        const bidders = re ? arr(A.tied) : arr(A.pl);
        const floor = re ? (A.top || 0) : 0;
        botInputs(S, W, now, bidders, id => ({ b: clamp(Math.max(floor, botBid(S, id) + (re && Math.random() < 0.5 ? 1 : 0)), floor, 5), lock: 1 }), 1500, re ? 4000 : 8500);
        if (!(allIn(S, bidders, v => v && v.lock) || pastDeadline(S, now))) return;
        const inp = inputs(S), bids = {};
        bidders.forEach(id => {
          const v = inp[id];
          if (v && Number.isFinite(Number(v.b))) bids[id] = clamp(Math.round(Number(v.b)), floor, 5);
          else if (online(S, id)) bids[id] = floor;
        });
        const top = Math.max(0, ...Object.keys(bids).map(k => bids[k]));
        const tied = Object.keys(bids).filter(id => bids[id] === top);
        if (!re) W.set('game/act/bids', bids); else W.set('game/act/rebids', bids);
        if (top > 0 && tied.length > 1 && !re) {
          W.set('game/act/tied', tied);
          W.set('game/act/top', top);
          setStage(S, W, now, 'rebid', 6000);
          return;
        }
        const allBids = Object.assign({}, A.bids || {}, re ? bids : {}, re ? {} : bids);
        const winner = top > 0 ? pick(tied) : null;
        const items = {};
        if (A.d.twist === 'allpay') Object.keys(allBids).forEach(id => add(items, id, allBids[id], 'Your bid', 1));
        else if (winner) add(items, winner, top, 'Winning bid', 1);
        if (winner) feed(S, W, now, `${nm(winner)} won the Auction for ${top} drink${top === 1 ? '' : 's'}`, [winner]);
        finishAct(S, W, now, { twist: A.d.twist, bids: A.bids || bids, rebids: re ? bids : null, winner, paid: top }, items, winner ? [winner] : []);
      },
      live(S, W, now) {
        const A = S.game.act, L = S.game.live;
        if (!L) return;
        const quiet = L.k ? 5000 : 9000;
        if (now - L.at >= ts(quiet) || (L.h >= 5 && now - L.at >= ts(1500))) {
          const winner = L.h > 0 ? L.by : null;
          const items = {};
          if (winner) { add(items, winner, L.h, 'Winning bid', 1); feed(S, W, now, `${nm(winner)} won the Auction for ${L.h} drink${L.h === 1 ? '' : 's'}`, [winner]); }
          finishAct(S, W, now, { twist: 'live', log: arr(L.log), winner, paid: L.h }, items, winner ? [winner] : []);
          return;
        }
        if (L.h >= 5) return;
        const bots = arr(A.pl).filter(id => isBot(S, id) && id !== L.by);
        for (const b of bots) {
          const cap = 1 + hash(A.sid + ':' + b) % (2 + Math.round(skill(S, b) * 3));
          if (L.h >= cap) continue;
          if (now - L.at < ts(900 + hash(b + ':' + L.k) % 2600)) continue;
          const v = L.h + 1, k = L.k;
          tx('live:' + A.sid + ':' + k, 'game/live', cur => (cur.k === k && cur.h < v && cur.by !== b) ? { h: v, by: b, at: db.now(), k: k + 1, log: arr(cur.log).concat([{ by: b, b: v }]).slice(-12) } : undefined);
          break;
        }
      }
    };

    /* Imposter: everyone gets the secret word except the imposter */
    K.imposter = {
      init(S, W, now, A, all) {
        if (all.length < 3) return false;
        A.pl = all;
        const cat = pick(IP.IMPOSTER), word = pick(cat.words);
        const under = all.length >= 4 && Math.random() < 0.35;
        const nImp = all.length >= 8 ? 2 : 1;
        A.d = { cat: cat.cat, word, mode: under ? 'undercover' : 'classic', imps: shuffle(all.slice()).slice(0, nImp), spk: shuffle(all.slice()) };
        if (under) A.d.alt = pickOther(cat.words, word);
      },
      next(S, W, now, stage) {
        if (stage === 'intro') { setStage(S, W, now, 'card', 0); return; }
        setStage(S, W, now, 'clues', 0);
        W.set('game/act/ci', 0);
        W.set('game/act/cAt', now);
      },
      nextClue(S, W, now) {
        const A = S.game.act, total = arr(A.d.spk).length * 2, ci = (A.ci || 0) + 1;
        if (ci >= total) { setStage(S, W, now, 'vote', 20000); return; }
        W.set('game/act/ci', ci);
        W.set('game/act/cAt', now);
      },
      tick(S, W, now) {
        const A = S.game.act, d = A.d, imps = arr(d.imps), pl = arr(A.pl);
        if (A.stage === 'clues') {
          const spk = arr(d.spk), who = spk[(A.ci || 0) % spk.length], el = now - (A.cAt || A.at);
          const p = PL(S)[who];
          if (!p || (p.bot && el >= ts(1800)) || (!p.bot && p.online === false && el >= ts(2500)) || el >= ts(15000)) this.nextClue(S, W, now);
        } else if (A.stage === 'vote') {
          botInputs(S, W, now, pl, id => ({ t: pickOther(pl, id), at: now }), 2000, 12000);
          if (!(allIn(S, pl, v => v && typeof v.t === 'string') || pastDeadline(S, now))) return;
          const inp = inputs(S), counts = {}, votes = {};
          pl.forEach(id => { counts[id] = 0; });
          pl.forEach(id => { const v = inp[id]; if (v && typeof v.t === 'string' && counts[v.t] !== undefined && v.t !== id) { counts[v.t]++; votes[id] = { t: v.t, at: Number(v.at) || now }; } });
          const ranked = pl.slice().sort((a, b) => counts[b] - counts[a] || (Math.random() - 0.5));
          let accused = [];
          if (imps.length === 1) {
            const top = counts[ranked[0]];
            if (top > 0 && ranked.filter(id => counts[id] === top).length === 1) accused = [ranked[0]];
          } else accused = ranked.filter(id => counts[id] > 0).slice(0, 2);
          const caught = imps.filter(id => accused.indexOf(id) !== -1);
          W.set('game/act/counts', counts);
          W.set('game/act/votes', votes);
          W.set('game/act/accused', accused);
          W.set('game/act/caught', caught);
          if (caught.length && d.mode === 'classic') {
            const cat = IP.IMPOSTER.find(c => c.cat === d.cat);
            const opts = {};
            caught.forEach(c => { opts[c] = shuffle([d.word].concat(shuffle(cat.words.filter(w => w !== d.word)).slice(0, 5))); });
            W.set('game/act/opts', opts);
            setStage(S, W, now, 'guess', 15000);
          } else this.resolve(S, W, now, {});
        } else if (A.stage === 'guess') {
          const caught = arr(A.caught), opts = A.opts || {};
          botInputs(S, W, now, caught, id => (Math.random() < 0.3 ? d.word : pick(arr(opts[id]))), 2500, 7000);
          if (!(allIn(S, caught, v => typeof v === 'string') || pastDeadline(S, now))) return;
          this.resolve(S, W, now, inputs(S));
        }
      },
      resolve(S, W, now, guesses) {
        const A = S.game.act, d = A.d, imps = arr(d.imps), caught = arr(A.caught), votes = A.votes || {};
        const free = imps.filter(id => caught.indexOf(id) === -1);
        const right = d.mode === 'classic' ? caught.filter(id => guesses[id] === d.word) : [];
        let winners = free.concat(right);
        const items = {};
        caught.filter(id => right.indexOf(id) === -1).forEach(id => add(items, id, 3, 'Caught'));
        if (free.length) Object.keys(votes).forEach(v => { if (imps.indexOf(votes[v].t) === -1) add(items, v, 2, 'Voted for an innocent'); });
        let firstVoter = null;
        if (!winners.length) {
          const good = Object.keys(votes).filter(v => imps.indexOf(votes[v].t) !== -1 && imps.indexOf(v) === -1).sort((a, b) => votes[a].at - votes[b].at);
          if (good.length) { firstVoter = good[0]; winners = [firstVoter]; }
        }
        const g = {};
        caught.forEach(id => { if (typeof guesses[id] === 'string') g[id] = guesses[id]; });
        feed(S, W, now, `Imposter: it was ${imps.map(nm).join(' and ')}`, imps);
        finishAct(S, W, now, { imps, caught, free, right, guesses: g, firstVoter, winners }, items, winners);
      }
    };

    /* Guess the Price: three products, closest guess on each scores */
    K.price = {
      init(S, W, now, A, all) {
        const P = IP.PRODUCTS || [];
        if (all.length < 2 || P.length < 3) return false;
        A.pl = all;
        A.d.items = shuffle(P.map((p, i) => i)).slice(0, 3);
      },
      next(S, W, now) { setStage(S, W, now, 'guess', 20000); W.set('game/act/i', 0); },
      tick(S, W, now) {
        const A = S.game.act, pl = arr(A.pl), i = A.i || 0;
        const prod = IP.PRODUCTS[arr(A.d.items)[i]], price = Math.round(prod.price * 100);
        if (A.stage === 'guess') {
          botInputs(S, W, now, pl, id => ({ v: clamp(Math.round(price * Math.exp(gauss() * (0.75 - 0.5 * skill(S, id)))), 1, 10000), lock: 1 }), 3000, 15000);
          if (!(allIn(S, pl, v => v && v.lock) || pastDeadline(S, now))) return;
          const inp = inputs(S), g = {};
          pl.forEach(id => { const v = inp[id]; if (v && Number.isFinite(Number(v.v))) g[id] = clamp(Math.round(Number(v.v)), 1, 10000); });
          const ids = Object.keys(g);
          const diff = id => Math.abs(g[id] - price);
          const min = ids.length ? Math.min(...ids.map(diff)) : 0, max = ids.length ? Math.max(...ids.map(diff)) : 0;
          const close = ids.filter(id => diff(id) === min);
          const far = ids.length >= 2 && max > min ? ids.filter(id => diff(id) === max) : [];
          const pts = Object.assign({}, A.pts || {}), miss = Object.assign({}, A.miss || {}), farN = Object.assign({}, A.farN || {});
          close.forEach(id => { pts[id] = (pts[id] || 0) + 1; });
          ids.forEach(id => { miss[id] = (miss[id] || 0) + diff(id); });
          far.forEach(id => { farN[id] = (farN[id] || 0) + 1; });
          W.set('game/act/pts', pts);
          W.set('game/act/miss', miss);
          W.set('game/act/farN', farN);
          W.set('game/act/rev', { i, price, g, close, far });
          W.set(`game/act/revs/${i}`, { price, close, far });
          setStage(S, W, now, 'reveal', 0);
        } else if (A.stage === 'reveal' && now - A.at >= ts(7000)) {
          if (i + 1 < arr(A.d.items).length) {
            W.set('game/act/i', i + 1);
            W.set('game/act/rev', null);
            setStage(S, W, now, 'guess', 20000);
            return;
          }
          const pts = A.pts || {}, miss = A.miss || {}, farN = A.farN || {};
          const ids = Object.keys(miss);
          ids.sort((a, b) => (pts[b] || 0) - (pts[a] || 0) || miss[a] - miss[b] || (Math.random() - 0.5));
          const winner = ids[0] || null;
          const items = {};
          Object.keys(farN).forEach(id => add(items, id, farN[id], 'Furthest guess'));
          finishAct(S, W, now, { pts, miss, winner }, items, winner ? [winner] : []);
        }
      }
    };

    /* Cards Against Humanity: one round, random judge */
    K.cah = {
      init(S, W, now, A, all) {
        const C = IP.CAH;
        if (all.length < 2 || !C) return false;
        A.pl = all;
        const last = S.lastJudge;
        const judge = pick(all.filter(id => id !== last).length ? all.filter(id => id !== last) : all);
        W.set('lastJudge', judge);
        const bi = rnd(C.black.length), pk = C.black[bi][1];
        const deck = shuffle(C.white.map((w, i) => i));
        const hands = {};
        all.filter(id => id !== judge).forEach(id => { hands[id] = deck.splice(0, 7); });
        A.d = { judge, bi, pick: pk, hands, rando: deck.splice(0, pk) };
      },
      next(S, W, now) { setStage(S, W, now, 'play', 45000); },
      tick(S, W, now) {
        const A = S.game.act, d = A.d, players = arr(A.pl).filter(id => id !== d.judge);
        if (A.stage === 'play') {
          const hand = id => arr(d.hands[id]);
          botInputs(S, W, now, players, id => ({ c: shuffle(hand(id).slice()).slice(0, d.pick), lock: 1 }), 3000, 14000);
          if (!(allIn(S, players, v => v && v.lock) || pastDeadline(S, now))) return;
          const inp = inputs(S), subs = [];
          players.forEach(id => {
            const h = hand(id);
            let c = (inp[id] && arr(inp[id].c).map(Number).filter(x => h.indexOf(x) !== -1)) || [];
            c = c.filter((x, j) => c.indexOf(x) === j).slice(0, d.pick);
            if (c.length < d.pick) {
              if (!online(S, id) && !c.length) return;
              shuffle(h.filter(x => c.indexOf(x) === -1)).slice(0, d.pick - c.length).forEach(x => c.push(x));
            }
            subs.push({ o: id, c });
          });
          subs.push({ o: 'rando', c: arr(d.rando) });
          W.set('game/act/subs', shuffle(subs));
          setStage(S, W, now, 'judge', 120000);
        } else if (A.stage === 'judge') {
          const subs = arr(A.subs), inp = inputs(S), jp = PL(S)[d.judge];
          let ch = inp[d.judge];
          const valid = typeof ch === 'number' && ch >= 0 && ch < subs.length;
          const el = now - A.at;
          if (!valid) {
            if ((jp && jp.bot && el >= ts(4500)) || (jp && !jp.bot && jp.online === false && el >= ts(8000)) || !jp || now >= A.until) ch = rnd(subs.length);
            else return;
          }
          const win = subs[ch], winner = win.o === 'rando' ? null : win.o;
          feed(S, W, now, winner ? `${nm(winner)} won Cards Against Humanity` : 'Rando won Cards Against Humanity. Nobody gets the Shield.', winner ? [winner] : []);
          finishAct(S, W, now, { choice: ch, winner, rando: !winner }, {}, winner ? [winner] : []);
        }
      }
    };

    /* ---------- inbox ---------- */
    function handle(S, W, it, now) {
      if (!it || !it.type) return;
      const host = it.from === S.hostId;
      const d = it.data || {};
      const G = S.game, A = G && G.act;
      switch (it.type) {
        case 'start': if (host && S.status === 'lobby') startGame(S, W, now); break;
        case 'addBot': if (host && S.status === 'lobby') addBot(S, W, now); break;
        case 'removePlayer': if (host && S.status === 'lobby' && d.pid && d.pid !== S.hostId) W.set('players/' + d.pid, null); break;
        case 'guess': if (G) onGuess(S, W, it.from, d.g, now); break;
        case 'pick': if (G) onPick(S, W, it.from, d, now); break;
        case 'next': if (G) onNext(S, W, it.from, host, now); break;
        case 'skip':
          if (!host || !G || G.phase !== 'turns') break;
          if (G.step === 'guess' || G.step === 'pick') skipTurn(S, W, now);
          else if (G.step === 'pen' && G.pen && !G.pen.out) resolvePen(S, W, now);
          break;
        case 'force':
          if (host && A && A.sid === d.sid && IP.GATE_STAGES[A.stage]) W.set('game/act/force', A.sid);
          break;
        case 'skipAct':
          if (host && A && A.stage !== 'pen' && A.stage !== 'done') finishAct(S, W, now, { skip: 'The host skipped this one.' }, {}, []);
          else if (host && A && A.stage === 'pen' && G.pen && !G.pen.out) resolvePen(S, W, now);
          break;
        case 'clueDone':
          if (A && A.kind === 'imposter' && A.stage === 'clues' && A.sid === d.sid && (A.ci || 0) === d.ci) {
            const spk = arr(A.d.spk), who = spk[(A.ci || 0) % spk.length];
            if (it.from === who || host) K.imposter.nextClue(S, W, now);
          }
          break;
        case 'miniContinue': if (host && G) miniContinue(S, W, now); break;
        case 'playAgain': if (host && S.status === 'ended') startGame(S, W, now); break;
        case 'toLobby': if (host) { W.set('status', 'lobby'); W.set('game', null); } break;
        case 'endGame': if (host && S.status === 'playing' && G) endGame(S, W, now); break;
      }
    }

    function step(S, W, now) {
      const G = S.game;
      if (!G) return;
      if (G.phase === 'turns') {
        const pid = activeId(S), p = PL(S)[pid];
        if (!p) {
          if (G.step === 'done' || (G.step === 'act' && G.act && G.act.stage === 'done')) advance(S, W, now);
          else if (G.step === 'act') { if (G.act && G.act.stage !== 'pen') finishAct(S, W, now, { skip: 'That player left.' }, {}, []); else penTick(S, W, now); }
          else if (G.step === 'pen') penTick(S, W, now);
          else skipTurn(S, W, now);
          return;
        }
        const bot = !!p.bot, el = now - G.stepAt;
        switch (G.step) {
          case 'guess':
            if (bot && el >= ts(1500)) onGuess(S, W, pid, rules.botGuess(G.hands[pid], G.round), now);
            else if (!bot && p.online === false && el >= ts(30000)) skipTurn(S, W, now);
            break;
          case 'spin': {
            const sl = curSlice(S);
            if (el >= ts(SPIN_MS + (sl.type === 'drinks' ? 0 : LAND_MS))) resolveSpin(S, W, now);
            break;
          }
          case 'pick':
            if (bot && el >= ts(1300)) botPick(S, W, now);
            else if (!bot && p.online === false && el >= ts(30000)) skipTurn(S, W, now);
            break;
          case 'pen': penTick(S, W, now); break;
          case 'act': tickAct(S, W, now); break;
          case 'done': if (el >= ts(bot ? 4500 : 30000)) advance(S, W, now); break;
        }
      } else if (G.phase === 'mini') tickAct(S, W, now);
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
        for (const k of Object.keys(inbox).sort()) {
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
