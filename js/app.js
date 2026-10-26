// Phone screens: home, lobby, the card table with the synced wheel, wheel games, mini games and
// the leaderboard. Every phone draws from the shared room; only the host's phone runs IP.Engine.
(function () {
  'use strict';
  const IP = window.IP;

  /* ---------- helpers ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const arr = IP.arr;
  const lowerFirst = s => s.charAt(0).toLowerCase() + s.slice(1);
  const upperFirst = s => s.charAt(0).toUpperCase() + s.slice(1);
  const vibrate = ms => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* not supported */ } };
  const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } }
  };
  const SUITS = ['h', 'd', 'c', 's'];
  const SUIT_CH = { h: '♥︎', d: '♦︎', c: '♣︎', s: '♠︎' };
  const SUIT_NAME = { h: 'Hearts', d: 'Diamonds', c: 'Clubs', s: 'Spades' };
  const isRed = s => s === 'h' || s === 'd';
  const rankLabel = r => ({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' })[r] || String(r);
  const cardText = c => rankLabel(c.r) + SUIT_CH[c.s];
  const drinks = n => `${n} drink${n === 1 ? '' : 's'}`;

  const ICON = {
    shield: f => `<svg class="ico ${f ? 'full' : 'empty'}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v6c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6l7-3z"/></svg>`,
    up: '<svg class="ico line" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
    down: '<svg class="ico line" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>',
    check: '<svg class="ico line" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
    x: '<svg class="ico line" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    star: '<svg class="ico full" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>',
    crown: '<svg class="ico line crown" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8l4.5 4 4.5-7 4.5 7L21 8l-2 11H5L3 8z"/></svg>',
    copy: '<svg class="ico line" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 9h10v10H9zM5 15V5h10"/></svg>'
  };
  const FAN = `<div class="fan" aria-hidden="true">
      <span class="fcard red" style="--x:-96px;--r:-14deg"><span class="rk">9</span><span class="st">${SUIT_CH.d}</span></span>
      <span class="fcard" style="--x:-32px;--r:-4deg"><span class="rk">J</span><span class="st">${SUIT_CH.c}</span></span>
      <span class="fcard back glow" style="--x:32px;--r:5deg"></span>
      <span class="fcard back" style="--x:96px;--r:14deg"></span>
    </div>`;
  const RULES = `<section class="rules" aria-labelledby="rulesTitle">
      <h2 class="h3" id="rulesTitle">How it plays</h2>
      <ol class="rule-list">
        <li><b>Red or black?</b><span>Guess the color of card 1.</span></li>
        <li><b>Higher or lower?</b><span>Than card 1. Jack, queen and king are high, aces are 1. A tie means everyone drinks.</span></li>
        <li><b>In between or outside?</b><span>Of your first two cards. Matching either one means everyone drinks.</span></li>
        <li><b>Guess the suit</b><span>One in four, with the wildest wheel.</span></li>
      </ol>
      <p class="rule-foot">Every guess spins the wheel: three drink slices plus five games everyone plays on their phones (phone vote, hot potato, trapdoor, musical chairs, odd one out). Guess right and you hand the drinks out or sit the game out. Guess wrong and you drink, then play. After every round there’s a mini game: Auction, Imposter, Guess the Price or Cards Against Humanity. Winning one gets you a Shield that blocks a punishment. Nothing starts until everyone taps “Got it”.</p>
    </section>`;

  /* ---------- client state ---------- */
  const C = {
    db: null, fireDb: null, pid: null, code: null, base: null, S: null, local: false,
    unsub: [], engine: null, view: null, queued: false,
    turnKey: null, flipped: false,
    ovKey: null, ovAct: null, ovFoot: null, ovLanded: false, ovTimer: 0, landTimer: 0,
    hostAwaySince: 0, hostTimer: 0, connected: true,
    actSid: null, actFoot: null, stageTimers: [], st: {}, penSent: {}
  };
  const cfg = window.FIREBASE_CONFIG;
  const onlineReady = !!(cfg && cfg.apiKey && cfg.databaseURL && window.firebase && window.firebase.initializeApp);

  const now = () => (C.db ? C.db.now() : Date.now());
  const G = () => C.S && C.S.game;
  const players = () => (C.S && C.S.players) || {};
  const nameOf = pid => pid === 'rando' ? 'Rando' : ((players()[pid] && players()[pid].name) || 'Someone');
  const isMe = pid => pid === C.pid;
  const isBot = pid => !!(players()[pid] && players()[pid].bot);
  const isOn = pid => { const p = players()[pid]; return !!p && (p.bot || p.online !== false); };
  const disp = pid => isMe(pid) ? 'You' : nameOf(pid);
  const dispIn = pid => isMe(pid) ? 'you' : nameOf(pid);
  const poss = pid => isMe(pid) ? 'your' : nameOf(pid) + '’s';
  const addr = (pid, text) => isMe(pid) ? text : `${nameOf(pid)}: ${lowerFirst(text)}`;
  const isHost = () => C.S && C.S.hostId === C.pid;
  const activeId = () => { const g = G(); return g ? arr(g.order)[g.turn] : null; };
  const stats = pid => ((G() && G().stats) || {})[pid] || {};
  const fmtFeed = t => upperFirst(String(t).replace(/\{\{([^}|]+)(\|poss)?\}\}/g, (m, id, p) => p ? poss(id) : dispIn(id)));
  const listNames = ids => {
    const n = ids.map((id, i) => esc(isMe(id) ? (i === 0 ? 'You' : 'you') : nameOf(id)));
    return n.length <= 1 ? (n[0] || '') : n.slice(0, -1).join(', ') + ' and ' + n[n.length - 1];
  };
  const curSlice = () => { const g = G(); return g && typeof g.slice === 'number' ? IP.wheelFor(g.round).slices[g.slice] : null; };

  function announce(t) { const el = $('#sr'); el.textContent = ''; setTimeout(() => { el.textContent = t; }, 40); }
  function setMain(html) { $('#main').innerHTML = html; window.scrollTo(0, 0); }
  function schedule() { if (C.queued) return; C.queued = true; requestAnimationFrame(() => { C.queued = false; render(); }); }
  function send(type, data) {
    if (!C.db || !C.base) return;
    const item = { from: C.pid, type, at: now() };
    if (data && Object.keys(data).length) item.data = data;
    C.db.push(C.base + '/inbox', item);
    if (C.engine) setTimeout(() => C.engine.poke(), 40);
  }
  function dbSet(path, v) { if (C.db && C.base) { C.db.set(C.base + '/' + path, v); if (C.engine) setTimeout(() => C.engine.poke(), 40); } }
  let wakeLock = null;
  function requestWake() {
    try {
      if (navigator.wakeLock && !wakeLock) navigator.wakeLock.request('screen').then(l => { wakeLock = l; l.addEventListener('release', () => { wakeLock = null; }); }).catch(() => {});
    } catch (e) { /* optional */ }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && C.code) requestWake(); });

  function cleanName(s) { return String(s || '').replace(/\s+/g, ' ').trim().slice(0, 14); }
  function randomCode() { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; let s = ''; for (let i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)]; return s; }
  function getFireDb() { if (!C.fireDb) C.fireDb = IP.FirebaseDB(cfg); return C.fireDb; }
  function shareUrl() { return location.origin + location.pathname + '?room=' + C.code; }

  /* ---------- home ---------- */
  function renderHome(msg) {
    leaveRoom();
    C.view = 'home';
    const name = LS.get('ip.name', '');
    const last = LS.get('ip.last', null);
    let code = '';
    try { code = (new URLSearchParams(location.search).get('room') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4); } catch (e) { /* no query */ }
    const recent = onlineReady && last && last.code && (Date.now() - last.at < 12 * 3600 * 1000) && last.code !== code;
    setMain(`<section class="screen" aria-labelledby="homeTitle">
      <header class="hero">
        <p class="eyebrow">Halloween night</p>
        <h1 class="display xl" id="homeTitle">Irish Poker</h1>
        <p class="lede">Four rounds of guessing, a wheel full of games and a mini game after every round. Everyone plays on their own phone.</p>
      </header>
      ${FAN}
      <div class="panel">
        <label class="field-label" for="nm">Your name</label>
        <input class="input" id="nm" maxlength="14" autocomplete="nickname" placeholder="The name everyone sees" value="${esc(name)}">
      </div>
      <div class="panel">
        <h2 class="h3">Join a game</h2>
        <div class="join-row">
          <label class="sr-only" for="jc">Room code</label>
          <input class="input code-input" id="jc" maxlength="4" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="CODE" value="${esc(code)}" ${onlineReady ? '' : 'disabled'}>
          <button type="button" class="btn btn-primary" id="joinBtn" ${onlineReady ? '' : 'disabled'}>Join</button>
        </div>
        ${recent ? `<button type="button" class="btn-text" id="rejoinBtn">Rejoin room ${esc(last.code)}</button>` : ''}
      </div>
      <div class="panel">
        <h2 class="h3">Hosting tonight?</h2>
        <p class="muted small">You get a room code to share. Your phone runs the game, so keep this page open and the screen on.</p>
        <button type="button" class="btn btn-bone btn-block" id="hostBtn" ${onlineReady ? '' : 'disabled'}>Host a game</button>
      </div>
      ${onlineReady ? '' : '<p class="note">Online play isn’t set up on this copy, so hosting and joining are off. Practice mode works.</p>'}
      <p class="err" id="homeErr" role="alert">${msg ? esc(msg) : ''}</p>
      <div class="practice">
        <p class="muted small">Want to learn it first?</p>
        <button type="button" class="btn btn-ghost btn-block" id="practiceBtn">Practice against bots</button>
      </div>
      ${RULES}
    </section>`);
    const err = t => { $('#homeErr').textContent = t; };
    const getName = () => { const n = cleanName($('#nm').value); if (!n) { err('Add your name first.'); $('#nm').focus(); return null; } LS.set('ip.name', n); return n; };
    $('#jc').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4); });
    $('#jc').addEventListener('keydown', e => { if (e.key === 'Enter') $('#joinBtn').click(); });
    $('#joinBtn').onclick = async () => { const n = getName(); if (!n) return; const c = $('#jc').value; if (!/^[A-Z]{4}$/.test(c)) { err('Room codes are 4 letters.'); return; } await joinGame(c, n, err); };
    $('#hostBtn').onclick = async () => { const n = getName(); if (!n) return; await hostGame(n, false, err); };
    $('#practiceBtn').onclick = async () => { const n = cleanName($('#nm').value) || 'You'; if (n !== 'You') LS.set('ip.name', n); await hostGame(n, true, err); };
    if (recent) $('#rejoinBtn').onclick = async () => { const n = getName(); if (!n) return; await joinGame(last.code, n, err); };
  }

  async function hostGame(name, local, err) {
    requestWake();
    try {
      C.local = local;
      C.db = local ? IP.LocalDB() : getFireDb();
      let code = null;
      for (let i = 0; i < 8 && !code; i++) {
        const c = randomCode();
        const t = now();
        const room = { createdAt: t, hostId: C.pid, status: 'lobby', players: { [C.pid]: { name, joinedAt: t, online: true } } };
        if (local) {
          ['Jake', 'Mia', 'Tyler', 'Ava', 'Marcus'].forEach((n, j) => { room.players['bot' + j + Math.random().toString(36).slice(2, 6)] = { name: n, bot: true, skill: Math.round((0.2 + Math.random() * 0.7) * 100) / 100, online: true, joinedAt: t + j + 1 }; });
        }
        const res = await C.db.transaction('rooms/' + c, cur => cur ? undefined : room);
        if (res.committed) code = c;
      }
      if (!code) { err('Couldn’t open a room. Check your connection and try again.'); return; }
      enterRoom(code);
    } catch (e) {
      console.error(e);
      err('Couldn’t reach the game server. Check your connection and try again.');
    }
  }

  async function joinGame(code, name, err) {
    requestWake();
    try {
      C.local = false;
      C.db = getFireDb();
      const room = await C.db.get('rooms/' + code);
      if (!room) { err(`No game with code ${code}. Check the code with the host.`); return; }
      const ps = room.players || {};
      if (!ps[C.pid]) {
        if (room.status !== 'lobby') { err('That game already started. Ask the host to start a new one after this game.'); return; }
        if (Object.keys(ps).length >= IP.MAX_PLAYERS) { err(`That table is full (${IP.MAX_PLAYERS} players).`); return; }
        let n = name, k = 2;
        const taken = Object.keys(ps).map(id => (ps[id].name || '').toLowerCase());
        while (taken.indexOf(n.toLowerCase()) !== -1) n = cleanName(name).slice(0, 12) + ' ' + (k++);
        await C.db.set(`rooms/${code}/players/${C.pid}`, { name: n, joinedAt: C.db.now(), online: true });
      }
      enterRoom(code);
    } catch (e) {
      console.error(e);
      err('Couldn’t reach the game server. Check your connection and try again.');
    }
  }

  function enterRoom(code) {
    C.code = code;
    C.base = 'rooms/' + code;
    C.view = null; C.turnKey = null; C.ovKey = null; C.actSid = null;
    if (!C.local) {
      LS.set('ip.last', { code, at: Date.now() });
      try { history.replaceState(null, '', location.pathname + '?room=' + code); } catch (e) { /* not allowed here */ }
    }
    C.db.presence(`${C.base}/players/${C.pid}/online`);
    C.unsub.push(C.db.onValue(C.base, v => { C.S = v; schedule(); }));
    C.unsub.push(C.db.onConnected(ok => { C.connected = ok; renderBanner(); }));
  }

  function leaveRoom() {
    C.unsub.forEach(f => { try { f(); } catch (e) { /* already gone */ } });
    C.unsub = [];
    if (C.engine) { C.engine.stop(); C.engine = null; }
    closeOverlay();
    clearStageTimers();
    clearTimeout(C.ovTimer); clearTimeout(C.landTimer); clearTimeout(C.hostTimer);
    C.ovTimer = 0; C.landTimer = 0; C.hostTimer = 0;
    C.code = null; C.base = null; C.S = null; C.view = null;
    renderBanner();
  }

  async function leaveGame() {
    const S = C.S;
    if (C.db && C.base && S) {
      if (S.hostId === C.pid && !C.local) await C.db.remove(C.base);
      else if (S.status === 'lobby') await C.db.set(`${C.base}/players/${C.pid}`, null);
      else await C.db.set(`${C.base}/players/${C.pid}/online`, false);
    }
    if (!C.local) LS.set('ip.last', null);
    try { history.replaceState(null, '', location.pathname); } catch (e) { /* not allowed here */ }
    renderHome();
  }
  function confirmLeave(btn) {
    if (btn.dataset.armed) { leaveGame(); return; }
    btn.dataset.armed = '1';
    btn.textContent = isHost() && !C.local ? 'Tap again: this ends the game for everyone' : 'Tap again to leave';
    setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armed; btn.textContent = btn.dataset.label; } }, 3500);
  }
  const leaveRow = label => `<div class="leave-row"><button type="button" class="btn-text" id="leaveBtn" data-label="${label}">${label}</button></div>`;
  function wireLeave() { const b = $('#leaveBtn'); if (b) b.onclick = e => confirmLeave(e.currentTarget); }

  /* ---------- banner (connection and host problems) ---------- */
  function renderBanner() {
    const b = $('#banner');
    const S = C.S;
    let html = '';
    if (C.code && !C.connected) html = '<p>Reconnecting… your spot is saved.</p>';
    else if (C.code && S && S.hostId !== C.pid && C.hostAwaySince && Date.now() - C.hostAwaySince > 12000) {
      html = `<p>The host’s phone dropped off.</p><button type="button" class="btn btn-bone" id="takeOver">Take over as host</button>`;
    }
    b.hidden = !html;
    b.innerHTML = html;
    const t = $('#takeOver');
    if (t) t.onclick = async () => {
      t.disabled = true;
      await C.db.transaction(C.base + '/hostId', cur => {
        const h = cur && players()[cur];
        if (h && h.online !== false) return undefined;
        return C.pid;
      });
    };
  }
  function checkHost(S) {
    const h = S.players && S.players[S.hostId];
    const away = !h || h.online === false;
    if (away && S.hostId !== C.pid && !C.local) {
      if (!C.hostAwaySince) { C.hostAwaySince = Date.now(); clearTimeout(C.hostTimer); C.hostTimer = setTimeout(renderBanner, 12100); }
    } else C.hostAwaySince = 0;
    renderBanner();
  }

  /* ---------- router ---------- */
  function render() {
    if (!C.code) return;
    const S = C.S;
    if (!S) { renderGone('This game was closed by the host.'); return; }
    if (!S.players || !S.players[C.pid]) { renderGone('You’re no longer at this table.'); return; }
    if (S.hostId === C.pid && !C.engine) { C.engine = IP.Engine(C.db, C.code, C.pid); C.engine.start(); }
    if (S.hostId !== C.pid && C.engine) { C.engine.stop(); C.engine = null; }
    checkHost(S);
    const g = S.game;
    const hostFlag = S.hostId === C.pid ? 'h' : 'g';
    let view;
    if (S.status === 'lobby' || !g) view = 'lobby:' + hostFlag;
    else if (g.phase === 'end') view = 'end:' + g.key;
    else if (g.act && (g.phase === 'mini' || g.step === 'act')) view = `act:${g.key}:${g.turnId}:${g.phase}`;
    else view = 'turns:' + g.key;
    if (view !== C.view) {
      C.view = view;
      closeOverlay(); C.ovKey = null;
      clearStageTimers();
      const kind = view.split(':')[0];
      if (kind === 'lobby') buildLobby();
      else if (kind === 'turns') { C.turnKey = null; buildTurns(); }
      else if (kind === 'act') buildAct();
      else buildEnd();
    }
    const kind = view.split(':')[0];
    if (kind === 'lobby') updateLobby();
    else if (kind === 'turns') updateTurns();
    else if (kind === 'act') updateAct();
    else updateEnd();
  }
  function renderGone(msg) {
    const code = C.code;
    leaveRoom();
    if (!C.local && code) LS.set('ip.last', null);
    C.view = 'gone';
    setMain(`<section class="screen"><h1 class="display">Game over</h1><p class="lede">${esc(msg)}</p><button type="button" class="btn btn-primary btn-block" id="goneHome">Back to the start</button></section>`);
    $('#goneHome').onclick = () => { try { history.replaceState(null, '', location.pathname); } catch (e) { /* not allowed */ } renderHome(); };
  }

  /* ---------- lobby ---------- */
  function buildLobby() {
    const host = isHost();
    setMain(`<section class="screen" aria-label="Lobby">
      <div class="topbar"><p class="eyebrow">${C.local ? 'Practice table' : 'Lobby'}</p><button type="button" class="btn-text" id="leaveBtn" data-label="Leave">Leave</button></div>
      ${C.local ? `<div class="code-card"><p class="eyebrow">Practice mode</p><p class="lede">Just you and bots on this phone. Bots can’t talk, so in Imposter and Cards Against Humanity they play at random.</p></div>` : `
      <div class="code-card">
        <p class="eyebrow">Room code</p>
        <p class="room-code">${esc(C.code)}</p>
        <p class="muted small">Friends open the link and type this code, or open this link directly:</p>
        <div class="share-row"><label class="sr-only" for="shareUrl">Game link</label><input class="input" id="shareUrl" readonly value="${esc(shareUrl())}"><button type="button" class="btn" id="copyBtn">${ICON.copy}<span>Copy</span></button></div>
      </div>`}
      <div class="table-head"><h2 class="h3">At the table</h2><p class="muted small" id="lbCount"></p></div>
      <ul class="lb-list" id="lbPlayers"></ul>
      ${host ? `<button type="button" class="btn" id="addBot">Add a bot</button>
      <button type="button" class="btn btn-primary btn-block" id="startBtn">Deal the cards</button>
      <p class="muted small center" id="startHint"></p>` : `<p class="waiting-line" id="lbWait"></p>`}
      ${RULES}
      <p class="credit">${esc(IP.CAH ? IP.CAH.credit : '')}</p>
    </section>`);
    wireLeave();
    const copy = $('#copyBtn');
    if (copy) copy.onclick = () => {
      const url = shareUrl();
      const done = () => { copy.querySelector('span').textContent = 'Copied'; setTimeout(() => { if (copy.isConnected) copy.querySelector('span').textContent = 'Copy'; }, 1800); };
      try { navigator.clipboard.writeText(url).then(done).catch(() => { $('#shareUrl').select(); }); } catch (e) { $('#shareUrl').select(); }
    };
    if (host) {
      $('#addBot').onclick = () => send('addBot');
      $('#startBtn').onclick = () => { requestWake(); send('start'); $('#startBtn').disabled = true; };
    }
    $('#lbPlayers').addEventListener('click', e => { const b = e.target.closest('[data-remove]'); if (b) send('removePlayer', { pid: b.dataset.remove }); });
  }
  function updateLobby() {
    const S = C.S, host = isHost(), ps = players();
    const ids = Object.keys(ps).sort((a, b) => (ps[a].joinedAt || 0) - (ps[b].joinedAt || 0));
    $('#lbCount').textContent = `${ids.length} of ${IP.MAX_PLAYERS}`;
    $('#lbPlayers').innerHTML = ids.map(id => {
      const p = ps[id];
      const tags = [id === S.hostId ? 'host' : '', p.bot ? 'bot' : '', p.online === false ? 'away' : ''].filter(Boolean);
      return `<li class="lb-row ${isMe(id) ? 'me' : ''} ${p.online === false ? 'off' : ''}"><span class="av" aria-hidden="true">${esc((p.name || '?').charAt(0).toUpperCase())}</span><span class="nm">${esc(p.name)}${isMe(id) ? ' (you)' : ''}</span>${tags.map(t => `<span class="tag-sm">${t}</span>`).join('')}${host && id !== S.hostId ? `<button type="button" class="btn-text" data-remove="${esc(id)}" aria-label="Remove ${esc(p.name)}">Remove</button>` : ''}</li>`;
    }).join('');
    if (host) {
      const ok = ids.length >= 2;
      $('#startBtn').disabled = !ok;
      $('#startHint').textContent = ok ? 'People can still join until you deal.' : 'You need at least one more player or a bot.';
      $('#addBot').disabled = ids.length >= IP.MAX_PLAYERS;
    } else {
      $('#lbWait').textContent = `Waiting for ${nameOf(S.hostId)} to deal the cards…`;
    }
  }

  /* ---------- the card table ---------- */
  function questionFor(pid, r, hand) {
    const c = hand, who = poss(pid);
    if (r === 1) return ['Red or black?', `Guess the color of ${who} first card.`];
    if (r === 2) return ['Higher or lower?', `Than ${who} ${cardText(c[0])}. Jack, queen and king are high, aces are 1. A tie means everyone drinks.`];
    if (r === 3) {
      if (c[0].r === c[1].r) return ['In between or outside?', `Both cards are ${rankLabel(c[0].r)}s, so only outside can win. Another ${rankLabel(c[0].r)} means everyone drinks.`];
      return ['In between or outside?', `Of the ${cardText(c[0])} and ${cardText(c[1])}. Matching either one means everyone drinks.`];
    }
    return ['Guess the suit', 'One in four. Hit it and you get the wildest wheel.'];
  }
  function guessOptions(r) {
    if (r === 1) return [{ id: 'red', cls: 'red', html: 'Red' }, { id: 'black', cls: 'black', html: 'Black' }];
    if (r === 2) return [{ id: 'higher', cls: 'btn-primary', html: ICON.up + '<span>Higher</span>' }, { id: 'lower', cls: 'btn-bone', html: ICON.down + '<span>Lower</span>' }];
    if (r === 3) return [{ id: 'between', cls: 'btn-primary', html: 'In between' }, { id: 'outside', cls: 'btn-bone', html: 'Outside' }];
    return SUITS.map(s => ({ id: s, cls: 'suit', html: `<span class="sym ${isRed(s) ? 'red' : ''}">${SUIT_CH[s]}</span><span>${SUIT_NAME[s]}</span>` }));
  }
  function guessLabel(r, g) {
    if (r === 4) return SUIT_NAME[g] || g;
    return { red: 'Red', black: 'Black', higher: 'Higher', lower: 'Lower', between: 'In between', outside: 'Outside' }[g] || g;
  }
  function slotHTML(c, i, up, r) {
    const state = up ? 'up' : (i === r - 1 ? 'current' : (i > r - 1 ? 'future' : ''));
    return `<div class="slot ${state}" data-i="${i}"><div class="flip ${up ? 'is-up instant' : ''}"><div class="side back">${(i === r - 1 && !up) ? '<span class="q">?</span>' : ''}</div><div class="side front ${isRed(c.s) ? 'red' : ''}"><span class="rk">${rankLabel(c.r)}</span><span class="big">${SUIT_CH[c.s]}</span><span class="sm">${SUIT_CH[c.s]}</span></div></div></div>`;
  }
  function miniCard(c, hl) { return `<span class="mc lg ${isRed(c.s) ? 'red' : ''} ${hl ? 'hl' : ''}">${rankLabel(c.r)}<i>${SUIT_CH[c.s]}</i></span>`; }

  function buildTurns() {
    setMain(`<section class="screen" aria-label="Game table">
      <div class="topbar"><p class="eyebrow" id="gRound"></p><div class="mystats" id="gStats"></div></div>
      <div class="turn"><p class="turn-who" id="gWho"></p><h2 class="display" id="gQ"></h2><p class="muted" id="gHelp"></p></div>
      <div class="felt"><p class="eyebrow" id="gHandLabel"></p><div class="hand" id="gHand"></div></div>
      <div class="guess" id="gGuess"></div>
      <div class="botbar"><p class="muted" id="gWait" aria-live="polite"></p><div id="gHostbar"></div></div>
      <div class="feed-wrap"><p class="eyebrow">What just happened</p><ul class="feed" id="gFeed"></ul></div>
      <div class="table-wrap"><div class="table-head"><h3 class="h3">At the table</h3><p class="muted small" id="gNext"></p></div><div class="seats" id="gSeats"></div></div>
      ${leaveRow('Leave game')}
    </section>`);
    $('#gGuess').addEventListener('click', e => {
      const b = e.target.closest('button[data-g]');
      if (!b || b.disabled) return;
      $$('#gGuess button').forEach(x => { x.disabled = true; });
      b.classList.add('picked');
      send('guess', { g: b.dataset.g });
    });
    $('#gHostbar').addEventListener('click', e => { const b = e.target.closest('[data-host]'); if (!b) return; b.disabled = true; send(b.dataset.host); });
    wireLeave();
  }

  function updateTurns() {
    const S = C.S, g = S.game, order = arr(g.order), pid = order[g.turn], hand = arr(g.hands[pid]);
    const key = g.key + ':' + g.turnId;
    const me = isMe(pid);
    if (C.turnKey !== key) {
      C.turnKey = key;
      const rc = IP.rules.revealedCount(g, pid);
      C.flipped = g.step !== 'guess';
      $('#gRound').textContent = `Round ${g.round} of 4 · ${IP.ROUND_NAMES[g.round]}`;
      const who = $('#gWho');
      who.textContent = me ? 'Your turn' : `${nameOf(pid)}’s turn`;
      who.classList.toggle('mine', me);
      const qh = questionFor(pid, g.round, hand);
      $('#gQ').textContent = qh[0];
      $('#gHelp').textContent = qh[1];
      $('#gHandLabel').textContent = me ? 'Your cards' : `${nameOf(pid)}’s cards`;
      $('#gHand').innerHTML = hand.map((c, i) => slotHTML(c, i, i < rc, g.round)).join('');
      const opts = guessOptions(g.round);
      $('#gGuess').innerHTML = opts.map(o => `<button type="button" class="btn gbtn ${o.cls} ${g.guess === o.id ? 'picked' : ''}" data-g="${o.id}" ${me && g.step === 'guess' ? '' : 'disabled'}>${o.html}</button>`).join('');
      if (me && g.step === 'guess') {
        announce('Your turn. ' + qh[0]);
        vibrate([40, 60, 40]);
        window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
      }
    }
    if (g.step !== 'guess' && !C.flipped) {
      C.flipped = true;
      flipCard(g.round - 1, now() - g.stepAt < 1500);
      $$('#gGuess button').forEach(b => { b.disabled = true; b.classList.toggle('picked', b.dataset.g === g.guess); });
    }
    const p = players()[pid] || {};
    const away = p.online === false && !p.bot;
    const name = nameOf(pid);
    let wait = '';
    if (me) wait = g.step === 'guess' ? 'Make your guess.' : '';
    else if (away) wait = `${name} has dropped off. The host can skip their turn.`;
    else wait = ({ guess: `${name} is thinking…`, spin: `${name} is spinning the wheel…`, pick: `${name} is handing out drinks…`, pen: 'Shield check…', done: `Waiting for ${name} to tap Next…` })[g.step] || '';
    $('#gWait').textContent = wait;
    const hb = $('#gHostbar');
    const canSkip = isHost() && !me && !p.bot && ['guess', 'pick'].indexOf(g.step) !== -1;
    const hbKey = canSkip ? 'skip:' + key + g.step : '';
    if (hb.dataset.key !== hbKey) { hb.dataset.key = hbKey; hb.innerHTML = canSkip ? `<button type="button" class="btn-text" data-host="skip">Skip ${esc(name)}’s turn</button>` : ''; }
    renderStats(); renderFeed(); renderSeats();
    const nxt = g.turn + 1;
    $('#gNext').textContent = nxt < order.length ? `Up next: ${disp(order[nxt])}` : 'Mini game after this turn';
    renderOverlay();
  }

  function flipCard(i, animate) {
    const slot = $(`#gHand .slot[data-i="${i}"]`);
    if (!slot) return;
    slot.classList.remove('current');
    slot.classList.add('up');
    const q = slot.querySelector('.q');
    if (q) q.remove();
    const f = slot.querySelector('.flip');
    if (!animate || reduceMotion) { f.classList.add('instant', 'is-up'); return; }
    void f.offsetWidth;
    f.classList.add('is-up');
  }
  const shieldPips = n => n > 2 ? `${ICON.shield(true)}<b class="sh-n">×${n}</b>` : ICON.shield(n >= 1) + ICON.shield(n >= 2);
  function renderStats() {
    const st = stats(C.pid), n = st.shields || 0;
    $('#gStats').innerHTML = `<span><b>${st.points || 0}</b> pts</span><span class="shields" role="img" aria-label="${n} Shield${n === 1 ? '' : 's'}">${shieldPips(n)}</span><span><b>${st.taken || 0}</b> drinks</span>`;
  }
  function renderFeed() {
    const g = G(), el = $('#gFeed');
    if (!el || !g) return;
    const f = g.feed || {};
    const keys = Object.keys(f).sort().reverse().slice(0, 6);
    el.innerHTML = keys.length ? keys.map(k => `<li class="${arr(f[k].w).indexOf(C.pid) !== -1 ? 'mine' : ''}">${esc(fmtFeed(f[k].t))}</li>`).join('') : '<li>Nothing yet. The first card is about to flip.</li>';
  }
  function renderSeats() {
    const g = G(), el = $('#gSeats');
    if (!el || !g) return;
    const act = activeId();
    el.innerHTML = arr(g.order).map(id => {
      const hand = arr(g.hands[id]), rc = IP.rules.revealedCount(g, id), st = stats(id), p = players()[id] || {};
      const shown = hand.slice(0, rc).map(cardText).join(', ');
      const cards = hand.map((c, i) => i < rc ? `<span class="mc ${isRed(c.s) ? 'red' : ''}">${rankLabel(c.r)}<i>${SUIT_CH[c.s]}</i></span>` : '<span class="mc down"></span>').join('');
      const sh = st.shields ? `<span class="pips" role="img" aria-label="${st.shields} Shield${st.shields > 1 ? 's' : ''}">${st.shields > 2 ? ICON.shield(true) + '×' + st.shields : ICON.shield(true).repeat(st.shields)}</span>` : '';
      return `<div class="seat ${id === act && g.phase === 'turns' ? 'active' : ''} ${isMe(id) ? 'me' : ''} ${p.online === false && !p.bot ? 'off' : ''}"><div class="seat-top"><span class="nm">${esc(isMe(id) ? 'You' : (p.name || '?'))}</span>${sh}<span class="pts" aria-label="${st.points || 0} points">${st.points || 0}</span></div><div class="seat-cards" role="img" aria-label="${shown ? 'Cards shown: ' + esc(shown) : 'No cards shown yet'}">${cards}</div></div>`;
    }).join('');
  }

  /* ---------- wheel overlay (drink slices and socials) ---------- */
  function openOverlay(html, label) {
    $('#ovBody').innerHTML = html;
    $('#ovSheet').setAttribute('aria-label', label || 'Turn result');
    $('#overlay').hidden = false;
    document.body.classList.add('locked');
    $('#ovSheet').scrollTop = 0;
  }
  function closeOverlay() {
    const o = $('#overlay');
    if (o) o.hidden = true;
    document.body.classList.remove('locked');
    clearTimeout(C.landTimer); C.landTimer = 0;
  }
  function wheelHTML(wheel) {
    const R = 125;
    const fills = ['var(--accent)', 'var(--plum)', 'var(--bone)', 'var(--felt)'];
    const inks = ['var(--accent-ink)', 'var(--bone)', 'var(--suit-black)', 'var(--bone)'];
    let paths = '', labels = '';
    wheel.slices.forEach((s, i) => {
      const a0 = (-112.5 + 45 * i) * Math.PI / 180, a1 = (-67.5 + 45 * i) * Math.PI / 180;
      const x0 = (R * Math.cos(a0)).toFixed(2), y0 = (R * Math.sin(a0)).toFixed(2), x1 = (R * Math.cos(a1)).toFixed(2), y1 = (R * Math.sin(a1)).toFixed(2);
      paths += `<path class="slice" data-i="${i}" d="M0 0L${x0} ${y0}A${R} ${R} 0 0 1 ${x1} ${y1}Z" style="fill:${fills[i % 4]};stroke:var(--ground);stroke-width:2"/>`;
      labels += `<text transform="rotate(${45 * i})" x="0" y="-84" text-anchor="middle" dominant-baseline="middle" style="fill:${inks[i % 4]}">${esc(IP.sliceLabel(s))}</text>`;
    });
    const list = wheel.slices.map(s => IP.sliceLabel(s).toLowerCase()).join(', ');
    return `<div class="wheel-box"><div class="wheel-disc"><svg viewBox="-130 -130 260 260" role="img" aria-label="Wheel: ${esc(list)}">${paths}<g class="wheel-labels">${labels}</g></svg></div><div class="wheel-hub" aria-hidden="true"></div><svg class="wheel-pointer" viewBox="0 0 26 30" aria-hidden="true"><path d="M2 2H24L13 28Z" style="fill:var(--bone);stroke:var(--ground);stroke-width:3;stroke-linejoin:round"/></svg></div>`;
  }
  function sliceText(sl, correct, pid) {
    if (sl.type === 'drinks') return addr(pid, correct ? `Give out ${drinks(sl.n)}` : `Take ${drinks(sl.n)}`);
    return `${IP.ACT_INFO[sl.type].name}! Everyone get your phone ready…`;
  }

  function renderOverlay() {
    const g = G();
    if (!g || g.phase !== 'turns' || g.step === 'guess' || g.step === 'act') {
      if (C.ovKey) { closeOverlay(); C.ovKey = null; }
      clearTimeout(C.ovTimer); C.ovTimer = 0;
      return;
    }
    const key = g.key + ':' + g.turnId, t = now();
    if (C.ovKey !== key) {
      const openAt = g.stepAt + 900;
      if ((g.step === 'spin' || g.outcome === 'social') && t < openAt) {
        if (!C.ovTimer) C.ovTimer = setTimeout(() => { C.ovTimer = 0; schedule(); }, openAt - t + 20);
        return;
      }
      C.ovKey = key; C.ovAct = null; C.ovFoot = null; C.ovLanded = false;
      buildOverlay();
    }
    updateOverlay();
  }

  function buildOverlay() {
    const g = G(), pid = activeId(), r = g.round, hand = arr(g.hands[pid]), me = isMe(pid);
    const name = disp(pid);
    if (g.outcome === 'social') {
      const reason = r === 2 ? `The ${cardText(hand[1])} ties the ${cardText(hand[0])}.` : `The ${cardText(hand[2])} matches one of the first two cards.`;
      openOverlay(`<div class="splash"><div class="ov-cards">${hand.slice(0, r).map((x, i) => miniCard(x, i === r - 1)).join('')}</div><p class="display">Everyone drinks!</p><p class="muted">${esc(reason)} Same card means a social, so nobody spins this time.</p></div><div id="ovAct"></div><div id="ovFoot"></div>`, 'Everyone drinks');
      announce('Everyone drinks. ' + reason);
      vibrate(80);
      return;
    }
    if (g.outcome === 'skipped' || !g.outcome) {
      openOverlay(`<div class="splash"><p class="display" style="font-size:30px">Turn skipped</p><p class="muted">${esc(me ? 'Your' : nameOf(pid) + '’s')} turn was skipped.</p></div><div id="ovAct"></div><div id="ovFoot"></div>`, 'Turn skipped');
      return;
    }
    const correct = g.outcome === 'correct';
    const wheel = IP.wheelFor(r);
    const note = correct ? (me ? 'You spin. Guessing right means you hand it out, or sit the game out.' : `${nameOf(pid)} spins. They guessed right, so they hand it out, or sit the game out.`) : (me ? 'You spin. Guessing wrong means it’s on you.' : `${nameOf(pid)} spins. They guessed wrong, so it’s on them.`);
    openOverlay(`
      <div class="ov-head">
        <div class="ov-cards">${hand.slice(0, r).map((c, i) => miniCard(c, i === r - 1)).join('')}</div>
        <div class="ov-verdict">
          <p class="muted">${esc(name)} called ${esc(guessLabel(r, g.guess))}</p>
          <p class="verdict ${correct ? 'good' : 'bad'}">${correct ? ICON.check + 'Correct' : ICON.x + 'Wrong'}</p>
        </div>
      </div>
      <p class="ov-note">${esc(note)}</p>
      <div class="wheel-wrap"><p class="eyebrow">Round ${r} wheel · ${esc(wheel.name)}</p>${wheelHTML(wheel)}</div>
      <div id="ovSay" hidden></div>
      <div id="ovAct"></div>
      <div id="ovFoot"></div>`, `${name}: ${correct ? 'correct' : 'wrong'}`);
    announce(`${name} called ${guessLabel(r, g.guess)}. ${correct ? 'Correct' : 'Wrong'}.`);
    if (me) vibrate(correct ? 30 : [30, 50, 30]);
    const disc = $('#ovBody .wheel-disc');
    const target = 360 * 5 + (((-45 * g.slice) % 360) + 360) % 360 + (g.jitter || 0);
    const remaining = g.stepAt + IP.SPIN_MS * (IP.TIME_SCALE || 1) - 150 - now();
    if (g.step !== 'spin' || remaining < 400 || reduceMotion) {
      disc.style.transition = 'none';
      disc.style.transform = `rotate(${target}deg)`;
      landWheel();
    } else {
      disc.style.transitionDuration = Math.round(remaining) + 'ms';
      void disc.offsetWidth;
      disc.style.transform = `rotate(${target}deg)`;
      C.landTimer = setTimeout(() => { landWheel(); schedule(); }, remaining + 40);
    }
  }
  function landWheel() {
    const g = G();
    if (!g || C.ovLanded) return;
    C.ovLanded = true;
    const disc = $('#ovBody .wheel-disc');
    if (disc) {
      const el = disc.querySelector(`.slice[data-i="${g.slice}"]`);
      if (el) { el.classList.add('landed'); el.parentNode.insertBefore(el, disc.querySelector('.wheel-labels')); }
    }
    const sl = curSlice(), say = $('#ovSay');
    if (sl && say) {
      say.hidden = false;
      const txt = sliceText(sl, g.outcome === 'correct', activeId());
      say.innerHTML = `<div class="say"><p class="eyebrow">The wheel says</p><p class="big" id="sayBig">${esc(txt)}</p></div>`;
      announce('The wheel says: ' + txt);
    }
  }
  function updateOverlay() {
    const g = G(), pid = activeId(), me = isMe(pid), key = g.key + ':' + g.turnId;
    if (g.outcome !== 'social' && g.outcome !== 'skipped' && g.step !== 'spin' && !C.ovLanded) {
      const disc = $('#ovBody .wheel-disc');
      if (disc) { clearTimeout(C.landTimer); disc.style.transition = 'none'; disc.style.transform = `rotate(${360 * 5 + (((-45 * g.slice) % 360) + 360) % 360 + (g.jitter || 0)}deg)`; }
      landWheel();
    }
    const act = $('#ovAct');
    const actKey = key + ':' + g.step + ':' + ((g.pen && g.pen.id) || '');
    if (act && C.ovAct !== actKey) {
      C.ovAct = actKey;
      act.onclick = null;
      if (g.step === 'pick') {
        if (me) pickDistribution(act, curSlice().n, pid);
        else act.innerHTML = `<p class="wait-line">${esc(nameOf(pid))} is handing out drinks…</p>`;
      } else if (g.step === 'pen' || g.step === 'done') act.innerHTML = '<div id="penBox"></div>';
      else act.innerHTML = '';
    }
    if ((g.step === 'pen' || g.step === 'done') && $('#penBox')) renderPen($('#penBox'));
    const host = isHost();
    const footKey = key + ':' + g.step + ':' + host;
    if (C.ovFoot !== footKey) {
      C.ovFoot = footKey;
      const foot = $('#ovFoot');
      if (foot) {
        if (g.step === 'done') {
          const p = players()[pid] || {};
          if (me || host) foot.innerHTML = `<button type="button" class="btn btn-primary btn-block" id="ovNext">${me ? 'Next turn' : (p.bot ? 'Next' : 'Next (host)')}</button>`;
          else foot.innerHTML = `<p class="muted center">Waiting for ${esc(nameOf(pid))} to tap Next…</p>`;
          const b = $('#ovNext');
          if (b) { b.onclick = () => { b.disabled = true; send('next'); }; if (me) b.focus({ preventScroll: true }); }
        } else foot.innerHTML = '';
      }
    }
  }
  function pickDistribution(act, n, pid) {
    const others = arr(G().order).filter(q => q !== pid);
    const counts = {};
    const used = () => Object.keys(counts).reduce((a, k) => a + counts[k], 0);
    const draw = focusId => {
      const left = n - used();
      act.innerHTML = `<div class="picker"><p class="picker-head"><span>Tap names to hand them out</span><b>${left} left</b></p>
        <div class="chips">${others.map(id => { const c = counts[id] || 0; return `<button type="button" class="chip ${c ? 'on' : ''}" data-id="${esc(id)}" aria-label="${esc(nameOf(id))}${c ? ', ' + c + ' given' : ''}">${esc(nameOf(id))}${c ? `<span class="ct">×${c}</span>` : ''}</button>`; }).join('')}</div>
        <div class="picker-actions"><button type="button" class="btn-text" data-act="reset">Reset</button><button type="button" class="btn-text" data-act="random">Random</button><button type="button" class="btn btn-primary" data-act="send" ${left ? 'disabled' : ''}>Send it</button></div></div>`;
      if (focusId) { const f = act.querySelector(`[data-id="${focusId}"]`) || act.querySelector('[data-act="send"]'); if (f) f.focus({ preventScroll: true }); }
    };
    draw();
    act.onclick = e => {
      const b = e.target.closest('button');
      if (!b) return;
      const left = n - used();
      if (b.dataset.id) { if (left > 0) { counts[b.dataset.id] = (counts[b.dataset.id] || 0) + 1; draw(left - 1 === 0 ? '__send' : b.dataset.id); } }
      else if (b.dataset.act === 'reset') { Object.keys(counts).forEach(k => delete counts[k]); draw(); }
      else if (b.dataset.act === 'random') { for (let i = 0; i < left; i++) { const q = others[Math.floor(Math.random() * others.length)]; counts[q] = (counts[q] || 0) + 1; } draw('__send'); }
      else if (b.dataset.act === 'send' && left === 0) { act.onclick = null; b.disabled = true; b.textContent = 'Sending…'; send('pick', { dist: Object.assign({}, counts) }); }
    };
  }

  /* ---------- Shield check (shared by the overlay and wheel/mini games) ---------- */
  function renderPen(box) {
    const g = G(), pen = g.pen;
    if (!pen) { box.innerHTML = ''; return; }
    const items = pen.items || {};
    const ids = Object.keys(items).filter(id => items[id].n > 0);
    const dec = (g.pendec && g.pendec[pen.id]) || {};
    const myAsk = pen.ask && pen.ask[C.pid] && !pen.out && !dec[C.pid] && !C.penSent[pen.id];
    const key = pen.id + ':' + (pen.out ? 'out' : 'ask') + ':' + (myAsk ? 1 : 0) + ':' + Object.keys(dec).join(',');
    if (box.dataset.key === key) return;
    box.dataset.key = key;
    if (myAsk) {
      const it = items[C.pid], st = stats(C.pid);
      box.innerHTML = `<div class="shield-ask"><div class="shield-badge">${ICON.shield(false)}</div><h2 class="display" style="font-size:26px">Use a Shield?</h2><p class="muted">Skip ${drinks(it.n)} (${esc(fmtFeed(it.why))}). You hold ${st.shields || 0}, and everyone sees you play it.</p><div class="two"><button type="button" class="btn btn-ghost" data-a="take">Take it</button><button type="button" class="btn btn-primary" data-a="use">Use Shield</button></div></div>`;
      vibrate([40, 40, 40]);
      box.onclick = e => {
        const b = e.target.closest('button[data-a]');
        if (!b) return;
        box.onclick = null;
        C.penSent[pen.id] = true;
        box.querySelectorAll('button').forEach(x => { x.disabled = true; });
        dbSet(`game/pendec/${pen.id}/${C.pid}`, b.dataset.a);
      };
      return;
    }
    if (!ids.length) { box.innerHTML = pen.out ? '<p class="result-line">Nobody drinks.</p>' : ''; return; }
    const out = pen.out || {};
    if (pen.ctx === 'social' && pen.out && !ids.some(id => out[id] && out[id].b)) { box.innerHTML = '<p class="result-line">Everyone drinks 1.</p>'; return; }
    const rows = ids.map(id => {
      const it = items[id], o = out[id];
      const waiting = !pen.out && pen.ask && pen.ask[id] && !dec[id];
      const status = o ? (o.b ? `<span class="blocked">${ICON.shield(true)} Shield</span>` : `<b>${drinks(it.n)}</b>`) : (waiting ? '<span class="muted">deciding on a Shield…</span>' : `<b>${drinks(it.n)}</b>`);
      return `<li class="${isMe(id) ? 'me' : ''}"><span class="dn">${esc(disp(id))}</span><span class="dw">${esc(fmtFeed(it.why))}</span><span class="ds">${status}</span></li>`;
    }).join('');
    box.innerHTML = `<p class="eyebrow">${pen.out ? 'Who drinks' : 'Shield check'}</p><ul class="drink-list">${rows}</ul>`;
  }

  /* ---------- wheel games and mini games ---------- */
  function clearStageTimers() { C.stageTimers.forEach(t => { clearTimeout(t); clearInterval(t); }); C.stageTimers = []; }
  function makeU() {
    const g = G(), A = g.act;
    const u = {
      // Live getters: buttons wired up when a stage starts must read the room as it is now.
      get S() { return C.S || {}; },
      get G() { return G() || g; },
      get A() { return (G() && G().act) || A; },
      me: C.pid, n: IP.ACT_DRINKS[A.round] || 2, st: C.st,
      esc, arr, isMe, isBot, isOn, nameOf, disp, poss, vibrate, isHost, send, now,
      list: listNames,
      inputs: () => { const v = (G().ain && G().ain[G().act.sid]) || {}; const o = {}; Object.keys(v).forEach(k => { if (k !== '_') o[k] = v[k]; }); return o; },
      input: v => dbSet(`game/ain/${A.sid}/${C.pid}`, v),
      tx: (path, fn) => C.db.transaction(C.base + '/' + path, cur => (cur === null || cur === undefined) ? null : fn(cur)).catch(e => { console.error(e); return null; }),
      on: (el, sel, cb, item) => {
        const box = el.querySelector(sel);
        if (!box) return;
        box.addEventListener('click', e => { const b = e.target.closest(item || 'button[data-v]'); if (!b || b.disabled || box.dataset.locked) return; cb(b.dataset.v); });
      },
      lockChoices: (el, sel, v, item) => {
        const box = el.querySelector(sel);
        if (!box) return;
        box.dataset.locked = '1';
        box.querySelectorAll(item || 'button[data-v]').forEach(b => { b.disabled = true; b.classList.toggle('picked', b.dataset.v === String(v)); });
      },
      later: (ms, fn) => { C.stageTimers.push(setTimeout(fn, ms)); },
      every: (ms, fn) => { C.stageTimers.push(setInterval(fn, ms)); },
      setTimer: sec => { const t = $('#aTimer'); if (!t) return; if (sec === null || sec === undefined) { t.hidden = true; return; } t.hidden = false; const s = Math.max(0, sec); t.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; },
      prizeCard: () => A.prize ? `<div class="prize">${A.prize === 'shield' ? ICON.shield(true) : ICON.crown}<div><p class="prize-title">${A.prize === 'shield' ? 'Winner gets a Shield' : 'Final game: bragging rights'}</p><p class="muted small">${A.prize === 'shield' ? 'A Shield blocks one punishment later.' : 'The last mini game of the night, just for fun.'}</p></div></div>` : ''
    };
    return u;
  }

  function buildAct() {
    const A = G().act, info = IP.ACT_INFO[A.kind];
    setMain(`<section class="screen act-screen" aria-label="${esc(info.name)}">
      <div class="topbar"><p class="eyebrow" id="aEye"></p><span class="timer-pill" id="aTimer" hidden></span></div>
      <h1 class="display" id="aTitle">${esc(info.name)}</h1>
      <div class="act-body" id="aBody"></div>
      <div class="act-foot" id="aFoot"></div>
      <div class="host-row" id="aHost"></div>
      ${leaveRow('Leave game')}
    </section>`);
    wireLeave();
    $('#aHost').addEventListener('click', e => {
      const b = e.target.closest('[data-host]');
      if (!b) return;
      if (b.dataset.host === 'skipAct' && !b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Tap again to skip this game'; return; }
      b.disabled = true;
      send(b.dataset.host, b.dataset.host === 'force' ? { sid: G().act.sid } : null);
    });
    C.actSid = null;
    const g = G();
    $('#aEye').textContent = A.ctx === 'mini'
      ? `Mini game · after round ${A.round}${A.prize === 'brag' ? ' · final game' : ''}`
      : `Wheel game · ${disp(A.sp)} guessed ${A.right ? 'right' : 'wrong'}`;
    if (A.ctx === 'slice') announce(`${info.name}. Read what's about to happen, then tap Got it.`);
    vibrate(50);
    void g;
  }

  function stageBody(u) {
    const A = u.A, UIk = IP.ACT_UI[A.kind], body = $('#aBody');
    clearStageTimers();
    C.st = {}; u.st = C.st;
    u.setTimer(null);
    if (A.stage === 'intro') { body.innerHTML = gateHTML(u, introHTML(u), 'Got it, I’m ready'); wireGate(u); return; }
    const sd = UIk.stages[A.stage];
    if (sd && sd.gate) { body.innerHTML = gateHTML(u, sd.top(u), sd.gate); wireGate(u); return; }
    if (A.stage === 'pen') { body.innerHTML = '<div id="penBox"></div>'; return; }
    if (A.stage === 'done') { buildDone(u, body); return; }
    if (sd) sd.build(u, body);
    else body.innerHTML = '';
  }
  function introHTML(u) {
    const A = u.A, it = IP.ACT_UI[A.kind].intro(u);
    const what = it.html ? it.what : esc(it.what);
    return `${it.banner || ''}${it.tag ? `<p><span class="tag">${esc(it.tag)}</span></p>` : ''}
      <p class="how">${what}</p>
      ${it.extra ? `<p class="how small-how">${esc(it.extra)}</p>` : ''}
      <div class="part"><p class="eyebrow">Your part</p><p>${esc(it.part)}</p></div>
      ${u.prizeCard()}`;
  }
  function gateHTML(u, top, label) {
    return `<div class="gate">${top}
      <button type="button" class="btn btn-primary btn-block big-btn" id="gateBtn">${esc(label)}</button>
      <div class="ready-wrap"><p class="eyebrow" id="readyCount"></p><ul class="ready-list" id="readyList"></ul></div></div>`;
  }
  function wireGate(u) {
    const sid = u.A.sid;
    $('#gateBtn').onclick = () => { requestWake(); dbSet(`game/ardy/${sid}/${C.pid}`, true); $('#gateBtn').disabled = true; };
  }
  function updateGate(u) {
    const g = G(), A = g.act, rd = (g.ardy && g.ardy[A.sid]) || {};
    const ids = arr(g.order).filter(id => players()[id]);
    const humans = ids.filter(id => !isBot(id) && isOn(id));
    const n = humans.filter(id => rd[id]).length;
    const mine = !!rd[C.pid];
    const btn = $('#gateBtn');
    if (btn) { btn.disabled = mine; if (mine) btn.textContent = 'You’re ready'; }
    const rc = $('#readyCount');
    if (rc) rc.textContent = `${n} of ${humans.length} ready${n < humans.length ? ' · starts when everyone is' : ''}`;
    const rl = $('#readyList');
    if (rl) rl.innerHTML = ids.map(id => { const ok = isBot(id) || rd[id]; const off = !isBot(id) && !isOn(id); return `<li class="${ok ? 'ok' : ''} ${off ? 'off' : ''}">${ok ? ICON.check : '<span class="dot" aria-hidden="true"></span>'}<span>${esc(disp(id))}${off ? ' (away)' : ''}</span><span class="sr-only">${ok ? 'ready' : 'not ready'}</span></li>`; }).join('');
  }
  function buildDone(u, body) {
    const A = u.A, UIk = IP.ACT_UI[A.kind];
    let res = '';
    if (A.res && A.res.skip) res = `<p class="outcome">${esc(A.res.skip)}</p>`;
    else res = UIk.results(u);
    const win = arr(A.win);
    let prize = '';
    if (A.ctx === 'mini' && win.length) prize = `<div class="prize won">${A.prize === 'shield' ? ICON.shield(true) : ICON.crown}<div><p class="prize-title">${listNames(win)} ${win.length > 1 || isMe(win[0]) ? 'win' : 'wins'} ${A.prize === 'shield' ? (win.length > 1 ? 'a Shield each' : 'a Shield') : 'bragging rights'}</p><p class="muted small">${A.prize === 'shield' ? 'Use it to skip a punishment later.' : 'Final mini game champ.'}</p></div></div>`;
    else if (A.ctx === 'mini' && !(A.res && A.res.skip)) prize = '<p class="muted center">No winner this time.</p>';
    body.innerHTML = `<div class="results">${res}${prize}<div id="penBox"></div></div><div id="doneNext"></div>`;
    if (A.ctx === 'mini' && win.indexOf(C.pid) !== -1) vibrate([60, 40, 60]);
  }
  function updateDone(u) {
    const A = u.A, el = $('#doneNext');
    if (!el) return;
    const host = isHost();
    let k, html;
    if (A.ctx === 'mini') {
      const label = A.round < 4 ? `On to round ${A.round + 1}` : 'See the leaderboard';
      k = 'm' + host;
      html = host ? `<button type="button" class="btn btn-primary btn-block" id="doneBtn" data-send="miniContinue">${label}</button>` : `<p class="waiting-line">Waiting for ${esc(nameOf(C.S.hostId))} to continue…</p>`;
    } else {
      const me = isMe(A.sp), p = players()[A.sp] || {};
      k = 's' + host + me;
      html = (me || host) ? `<button type="button" class="btn btn-primary btn-block" id="doneBtn" data-send="next">${me ? 'Next turn' : (p.bot ? 'Next' : 'Next (host)')}</button>` : `<p class="waiting-line">Waiting for ${esc(nameOf(A.sp))} to tap Next…</p>`;
    }
    if (el.dataset.k === k) return;
    el.dataset.k = k;
    el.innerHTML = html;
    const b = $('#doneBtn');
    if (b) b.onclick = () => { b.disabled = true; send(b.dataset.send); };
  }
  function updateAct() {
    const g = G(), A = g.act;
    if (!A || !A.stage) return;
    const u = makeU();
    if (C.actSid !== A.sid) { C.actSid = A.sid; stageBody(u); }
    u.st = C.st;
    if (A.stage === 'intro' || (IP.ACT_UI[A.kind].stages[A.stage] && IP.ACT_UI[A.kind].stages[A.stage].gate)) updateGate(u);
    else if (A.stage === 'pen' || A.stage === 'done') { const pb = $('#penBox'); if (pb) renderPen(pb); if (A.stage === 'done') updateDone(u); }
    else { const sd = IP.ACT_UI[A.kind].stages[A.stage]; if (sd) sd.update(u, $('#aBody')); }
    // countdown for stages with a deadline
    if (A.until && !IP.GATE_STAGES[A.stage] && A.stage !== 'pen' && A.stage !== 'done' && !(A.kind === 'chairs')) {
      const left = Math.ceil((A.until - now()) / 1000 / (IP.TIME_SCALE || 1));
      u.setTimer(Math.max(0, left));
      if (!C.st.tick) { C.st.tick = true; u.every(250, () => { const a = G() && G().act; if (a && a.sid === A.sid) u.setTimer(Math.max(0, Math.ceil((a.until - now()) / 1000 / (IP.TIME_SCALE || 1)))); }); }
    }
    // host controls
    const hk = isHost() ? A.sid + ':' + A.stage : '';
    const hb = $('#aHost');
    if (hb && hb.dataset.k !== hk) {
      hb.dataset.k = hk;
      let h = '';
      if (isHost()) {
        if (IP.GATE_STAGES[A.stage]) h = '<button type="button" class="btn-text" data-host="force">Host: start without waiting</button>';
        else if (A.stage !== 'done') h = `<button type="button" class="btn-text" data-host="skipAct">${A.stage === 'pen' ? 'Host: stop waiting on Shields' : 'Host: skip this game'}</button>`;
      }
      hb.innerHTML = h;
    }
  }

  /* ---------- leaderboard ---------- */
  function buildEnd() {
    const g = G(), ps = players();
    const ids = arr(g.order).filter(id => ps[id]);
    const st = id => (g.stats && g.stats[id]) || {};
    const rk = {};
    ids.forEach(id => { rk[id] = Math.random(); });
    const sorted = ids.slice().sort((a, b) => (st(b).points || 0) - (st(a).points || 0) || (st(b).miniWins || 0) - (st(a).miniWins || 0) || rk[a] - rk[b]);
    const place = id => { const more = ids.filter(q => (st(q).points || 0) > (st(id).points || 0)).length; const tie = ids.some(q => q !== id && (st(q).points || 0) === (st(id).points || 0)); return (tie ? 'T' : '') + (more + 1); };
    const w = sorted[0];
    let why = 'Card Shark';
    if (sorted[1] && (st(sorted[1]).points || 0) === (st(w).points || 0)) why = (st(sorted[1]).miniWins || 0) < (st(w).miniWins || 0) ? 'Won on mini games' : 'Won the tiebreak';
    const most = key => sorted.reduce((a, b) => ((st(b)[key] || 0) > (st(a)[key] || 0) ? b : a), sorted[0]);
    const pun = most('taken'), gen = most('given'), mvp = most('miniWins'), champ = ids.find(id => st(id).champ);
    const pod = (id, n) => id ? `<div class="pod p${n} ${isMe(id) ? 'me' : ''}">${n === 1 ? ICON.crown : ''}<p class="place">${n}</p><span class="av" aria-hidden="true">${esc(nameOf(id).charAt(0).toUpperCase())}</span><p class="nm">${esc(disp(id))}</p><p class="pts-line">${st(id).points || 0} pts</p>${n === 1 ? `<p class="why">${esc(why)}</p>` : ''}</div>` : '<div></div>';
    setMain(`<section class="screen" aria-label="Leaderboard">
      <div class="hero"><p class="eyebrow">Game over · 4 rounds</p><h1 class="display">Leaderboard</h1></div>
      <div class="podium">${pod(sorted[1], 2)}${pod(sorted[0], 1)}${pod(sorted[2], 3)}</div>
      <div class="awards">
        <div class="award"><p class="eyebrow">Most punished</p><p>${esc(disp(pun))} · ${st(pun).taken || 0} drinks</p></div>
        <div class="award"><p class="eyebrow">Most generous</p><p>${esc(disp(gen))} · gave ${st(gen).given || 0}</p></div>
        ${(st(mvp).miniWins || 0) ? `<div class="award"><p class="eyebrow">Mini-game MVP</p><p>${esc(disp(mvp))} · ${st(mvp).miniWins} win${st(mvp).miniWins > 1 ? 's' : ''}</p></div>` : ''}
        ${champ ? `<div class="award"><p class="eyebrow">Final game champ</p><p>${esc(disp(champ))}</p></div>` : ''}
      </div>
      <ol class="res-list" aria-label="Everyone else">${sorted.slice(3).map(id => `<li class="res-row ${isMe(id) ? 'me' : ''}"><span class="res-rank">${place(id)}</span><span class="res-name">${esc(disp(id))}</span><span class="res-score">${st(id).points || 0} pts</span></li>`).join('')}</ol>
      <div id="endActions"></div>
      ${leaveRow('Leave')}
    </section>`);
    wireLeave();
    announce(`Game over. ${isMe(w) ? 'You win' : nameOf(w) + ' wins'} with ${st(w).points || 0} points.`);
  }
  function updateEnd() {
    const el = $('#endActions'), k = isHost() ? 'h' : 'g';
    if (el.dataset.k === k) return;
    el.dataset.k = k;
    if (isHost()) {
      el.innerHTML = '<div class="end-actions"><button type="button" class="btn btn-ghost" id="toLobby">Back to lobby</button><button type="button" class="btn btn-primary" id="again">Play again</button></div><p class="muted small center">Play again keeps the same table and deals new cards.</p>';
      $('#again').onclick = e => { e.currentTarget.disabled = true; send('playAgain'); };
      $('#toLobby').onclick = e => { e.currentTarget.disabled = true; send('toLobby'); };
    } else el.innerHTML = `<p class="waiting-line">Waiting for ${esc(nameOf(C.S.hostId))} to start another game…</p>`;
  }

  /* ---------- boot ---------- */
  function boot() {
    C.pid = LS.get('ip.pid', null);
    if (!C.pid) { C.pid = 'p' + Math.random().toString(36).slice(2, 12); LS.set('ip.pid', C.pid); }
    renderHome();
  }
  boot();
})();
