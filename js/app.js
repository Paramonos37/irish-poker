// Phone screens: home, lobby, the card table with the synced wheel, mini games and the leaderboard.
// Every phone draws from the shared room; only the host's phone runs IP.Engine.
(function () {
  'use strict';
  const IP = window.IP;

  /* ---------- helpers ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const arr = IP.arr;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
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
  const ROUND_NAMES = ['', 'Red or black', 'Higher or lower', 'In between or outside', 'Guess the suit'];

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
      <p class="rule-foot">Guess right and you spin the wheel and hand it out. Guess wrong and you spin it and do it yourself. After rounds 1 to 3, a mini game wins someone a Shield that skips one punishment (hold up to 2). After round 4, the mini game is worth a bonus point.</p>
    </section>`;

  /* ---------- client state ---------- */
  const C = {
    db: null, fireDb: null, pid: null, code: null, base: null, S: null, local: false,
    unsub: [], engine: null, view: null, queued: false,
    turnKey: null, flipped: false,
    ovKey: null, ovAct: null, ovFoot: null, ovLanded: false, ovTimer: 0, landTimer: 0,
    hostAwaySince: 0, hostTimer: 0, miniPrep: {}, miniKey: null, miniDone: null, editor: null, connected: true
  };
  const cfg = window.FIREBASE_CONFIG;
  const onlineReady = !!(cfg && cfg.apiKey && cfg.databaseURL && window.firebase && window.firebase.initializeApp);

  const now = () => (C.db ? C.db.now() : Date.now());
  const G = () => C.S && C.S.game;
  const players = () => (C.S && C.S.players) || {};
  const nameOf = pid => (players()[pid] && players()[pid].name) || 'Someone';
  const isMe = pid => pid === C.pid;
  const disp = pid => isMe(pid) ? 'You' : nameOf(pid);
  const dispIn = pid => isMe(pid) ? 'you' : nameOf(pid);
  const poss = pid => isMe(pid) ? 'your' : nameOf(pid) + '’s';
  const addr = (pid, text) => isMe(pid) ? text : `${nameOf(pid)}: ${lowerFirst(text)}`;
  const isHost = () => C.S && C.S.hostId === C.pid;
  const activeId = () => { const g = G(); return g ? arr(g.order)[g.turn] : null; };
  const stats = pid => ((G() && G().stats) || {})[pid] || {};
  const fmtFeed = t => upperFirst(String(t).replace(/\{\{([^}|]+)(\|poss)?\}\}/g, (m, id, p) => p ? poss(id) : dispIn(id)));
  const wheels = () => IP.normalizeWheels(C.S && C.S.wheels);
  const currentSlice = () => { const g = G(); return g && typeof g.slice === 'number' ? wheels()[g.round - 1].slices[g.slice] : null; };

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
        <p class="lede">Four rounds of guessing, a punishment wheel and mini games between rounds. Everyone plays on their own phone.</p>
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
      ${onlineReady ? '' : '<p class="note">Online play isn’t set up on this copy yet, so hosting and joining are off. Practice mode works.</p>'}
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
    $('#practiceBtn').onclick = async () => { const n = cleanName($('#nm').value) || 'You'; LS.set('ip.name', n === 'You' ? LS.get('ip.name', '') : n); await hostGame(n, true, err); };
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
        const room = { createdAt: t, hostId: C.pid, status: 'lobby', wheels: IP.normalizeWheels(LS.get('ip.wheels', null)), players: { [C.pid]: { name, joinedAt: t, online: true } } };
        if (local) {
          const ids = ['Jake', 'Mia', 'Tyler', 'Ava', 'Marcus'];
          ids.forEach((n, j) => { room.players['bot' + j + Math.random().toString(36).slice(2, 6)] = { name: n, bot: true, skill: Math.round((0.2 + Math.random() * 0.7) * 100) / 100, online: true, joinedAt: t + j + 1 }; });
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
    C.view = null; C.turnKey = null; C.ovKey = null; C.miniKey = null; C.editor = null;
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
    clearTimeout(C.ovTimer); clearTimeout(C.landTimer); clearTimeout(C.hostTimer);
    C.ovTimer = 0; C.landTimer = 0; C.hostTimer = 0;
    C.code = null; C.base = null; C.S = null; C.view = null; C.editor = null;
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
    if (C.editor) return;
    const g = S.game;
    let view;
    const hostFlag = S.hostId === C.pid ? 'h' : 'g';
    if (S.status === 'lobby' || !g) view = 'lobby:' + hostFlag;
    else if (g.phase === 'turns') view = 'turns:' + g.key;
    else if (g.phase === 'mini-intro') view = `mini-intro:${g.key}:${g.mini.round}:${hostFlag}`;
    else if (g.phase === 'mini-play') view = `mini-play:${g.key}:${g.mini.round}`;
    else if (g.phase === 'mini-results') view = `mini-results:${g.key}:${g.mini.round}`;
    else view = 'end:' + g.key;
    if (view !== C.view) {
      C.view = view;
      closeOverlay(); C.ovKey = null;
      const kind = view.split(':')[0];
      if (kind === 'lobby') buildLobby();
      else if (kind === 'turns') { C.turnKey = null; buildTurns(); }
      else if (kind === 'mini-intro') buildMiniIntro();
      else if (kind === 'mini-play') buildMiniPlay();
      else if (kind === 'mini-results') buildMiniResults();
      else buildEnd();
    }
    const kind = view.split(':')[0];
    if (kind === 'lobby') updateLobby();
    else if (kind === 'turns') updateTurns();
    else if (kind === 'mini-intro') updateMiniIntro();
    else if (kind === 'mini-play') updateMiniPlay();
    else if (kind === 'mini-results') updateMiniResults();
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
      ${C.local ? `<div class="code-card"><p class="eyebrow">Practice mode</p><p class="lede">Just you and bots on this phone. Add or remove bots, then start.</p></div>` : `
      <div class="code-card">
        <p class="eyebrow">Room code</p>
        <p class="room-code">${esc(C.code)}</p>
        <p class="muted small">Friends open the link and type this code, or open this link directly:</p>
        <div class="share-row"><label class="sr-only" for="shareUrl">Game link</label><input class="input" id="shareUrl" readonly value="${esc(shareUrl())}"><button type="button" class="btn" id="copyBtn">${ICON.copy}<span>Copy</span></button></div>
      </div>`}
      <div class="table-head"><h2 class="h3">At the table</h2><p class="muted small" id="lbCount"></p></div>
      <ul class="lb-list" id="lbPlayers"></ul>
      ${host ? `<div class="host-tools">
        <button type="button" class="btn" id="addBot">Add a bot</button>
        <button type="button" class="btn" id="editWheels">Edit the wheels</button>
      </div>
      <button type="button" class="btn btn-primary btn-block" id="startBtn">Deal the cards</button>
      <p class="muted small center" id="startHint"></p>` : `<p class="waiting-line" id="lbWait"></p>`}
      ${RULES}
    </section>`);
    $('#leaveBtn').onclick = e => confirmLeave(e.currentTarget);
    const copy = $('#copyBtn');
    if (copy) copy.onclick = () => {
      const url = shareUrl();
      const done = () => { copy.querySelector('span').textContent = 'Copied'; setTimeout(() => { if (copy.isConnected) copy.querySelector('span').textContent = 'Copy'; }, 1800); };
      try { navigator.clipboard.writeText(url).then(done).catch(() => { $('#shareUrl').select(); }); } catch (e) { $('#shareUrl').select(); }
    };
    if (host) {
      $('#addBot').onclick = () => send('addBot');
      $('#editWheels').onclick = openEditor;
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
      $('#startHint').textContent = ok ? 'Everyone can still join until you deal.' : 'You need at least one more player or a bot.';
      $('#addBot').disabled = ids.length >= IP.MAX_PLAYERS;
    } else {
      $('#lbWait').textContent = `Waiting for ${nameOf(S.hostId)} to deal the cards…`;
    }
  }

  /* ---------- wheel editor (host, lobby only) ---------- */
  function openEditor() {
    C.editor = { wheels: IP.cloneWheels(wheels()), tab: 0 };
    renderEditor();
  }
  function fieldsFor(s, i) {
    const ta = (f, label, rows) => `<label class="ed-field"><span>${label}</span><textarea class="input" rows="${rows || 2}" data-i="${i}" data-f="${f}">${esc(s[f] || '')}</textarea></label>`;
    const nm = (f, label, max) => `<label class="ed-field ed-num"><span>${label}</span><input class="input" type="number" min="1" max="${max}" inputmode="numeric" data-i="${i}" data-f="${f}" value="${esc(s[f])}"></label>`;
    switch (s.type) {
      case 'drinks': return nm('n', 'How many drinks', 10);
      case 'all': return nm('n', 'Everyone drinks this many', 5);
      case 'pick': return ta('give', 'Guessed right: the spinner is told') + ta('done', 'Then the person they pick has to') + ta('take', 'Guessed wrong: the spinner has to');
      case 'say': return ta('give', 'Guessed right') + ta('take', 'Guessed wrong');
      case 'group': return ta('text', 'Everyone plays');
      case 'none': return '<p class="muted small">Nothing happens either way.</p>';
      case 'shield': return '<p class="muted small">Guessed right: a bonus Shield. Guessed wrong: nothing happens.</p>';
      default: return '';
    }
  }
  function renderEditor() {
    const E = C.editor, w = E.wheels[E.tab];
    setMain(`<section class="screen" aria-label="Edit the wheels">
      <div class="topbar"><p class="eyebrow">Edit the wheels</p><button type="button" class="btn-text" id="edCancel">Cancel</button></div>
      <p class="muted">One wheel per round, eight slices each. Guess right and the spinner hands it out. Guess wrong and it’s on them.</p>
      <div class="tabs" role="tablist">${E.wheels.map((x, i) => `<button type="button" role="tab" class="tab ${i === E.tab ? 'on' : ''}" aria-selected="${i === E.tab}" data-tab="${i}">Round ${i + 1}</button>`).join('')}</div>
      <label class="ed-field"><span>Wheel name</span><input class="input" id="edName" maxlength="24" value="${esc(w.name)}"></label>
      <div class="ed-list">${w.slices.map((s, i) => `<div class="ed-slice" data-slice="${i}">
        <div class="ed-top">
          <span class="ed-num-badge" aria-hidden="true">${i + 1}</span>
          <label class="sr-only" for="edl${i}">Slice ${i + 1} label</label>
          <input class="input ed-label" id="edl${i}" maxlength="10" data-i="${i}" data-f="label" value="${esc(s.label)}">
          <label class="sr-only" for="edt${i}">Slice ${i + 1} type</label>
          <select class="input ed-type" id="edt${i}" data-i="${i}" data-f="type">${Object.keys(IP.SLICE_TYPES).map(t => `<option value="${t}" ${t === s.type ? 'selected' : ''}>${IP.SLICE_TYPES[t]}</option>`).join('')}</select>
        </div>
        <div class="ed-fields">${fieldsFor(s, i)}</div>
      </div>`).join('')}</div>
      <div class="end-actions"><button type="button" class="btn btn-ghost" id="edReset">Reset this wheel</button><button type="button" class="btn btn-primary" id="edSave">Save wheels</button></div>
      <p class="muted small">Saved wheels are also remembered on this phone for your next game.</p>
    </section>`);
    $('#edCancel').onclick = () => { C.editor = null; C.view = null; schedule(); };
    $$('.tab').forEach(b => { b.onclick = () => { E.tab = +b.dataset.tab; renderEditor(); }; });
    $('#edName').oninput = e => { w.name = e.target.value; };
    $('.ed-list').addEventListener('input', e => {
      const el = e.target, i = el.dataset.i, f = el.dataset.f;
      if (i === undefined || !f || f === 'type') return;
      w.slices[+i][f] = (f === 'n') ? Number(el.value) : (f === 'label' ? el.value.toUpperCase() : el.value);
    });
    $('.ed-list').addEventListener('change', e => {
      const el = e.target;
      if (el.dataset.f !== 'type') return;
      const i = +el.dataset.i, old = w.slices[i];
      w.slices[i] = Object.assign({ label: old.label, type: el.value }, IP.SLICE_DEFAULTS[el.value]);
      el.closest('.ed-slice').querySelector('.ed-fields').innerHTML = fieldsFor(w.slices[i], i);
    });
    $('#edReset').onclick = () => { E.wheels[E.tab] = IP.cloneWheels(IP.DEFAULT_WHEELS[E.tab]); renderEditor(); };
    $('#edSave').onclick = async () => {
      const clean = IP.normalizeWheels(E.wheels);
      LS.set('ip.wheels', clean);
      await C.db.set(C.base + '/wheels', clean);
      C.editor = null; C.view = null; schedule();
    };
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
      <div class="leave-row"><button type="button" class="btn-text" id="leaveBtn" data-label="Leave game">Leave game</button></div>
    </section>`);
    $('#gGuess').addEventListener('click', e => {
      const b = e.target.closest('button[data-g]');
      if (!b || b.disabled) return;
      $$('#gGuess button').forEach(x => { x.disabled = true; });
      b.classList.add('picked');
      send('guess', { g: b.dataset.g });
    });
    $('#gHostbar').addEventListener('click', e => { const b = e.target.closest('[data-host]'); if (!b) return; b.disabled = true; send(b.dataset.host); });
    $('#leaveBtn').onclick = e => confirmLeave(e.currentTarget);
  }

  function updateTurns() {
    const S = C.S, g = S.game, order = arr(g.order), pid = order[g.turn], hand = arr(g.hands[pid]);
    const key = g.key + ':' + g.turnId;
    const me = isMe(pid);
    if (C.turnKey !== key) {
      C.turnKey = key;
      const rc = IP.rules.revealedCount(g, pid);
      C.flipped = g.step !== 'guess';
      $('#gRound').textContent = `Round ${g.round} of 4 · ${ROUND_NAMES[g.round]}`;
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
    else wait = ({ guess: `${name} is thinking…`, spin: `${name} is spinning the wheel…`, pick: `${name} is handing it out…`, shield: `${name} is deciding on a Shield…`, done: `Waiting for ${name} to tap Next…`, social: `Waiting for ${name} to tap Next…` })[g.step] || '';
    $('#gWait').textContent = wait;
    const hb = $('#gHostbar');
    const canSkip = isHost() && !me && !p.bot && ['guess', 'pick', 'shield'].indexOf(g.step) !== -1;
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
  function renderStats() {
    const st = stats(C.pid);
    $('#gStats').innerHTML = `<span><b>${st.points || 0}</b> pts</span><span class="shields" role="img" aria-label="${st.shields || 0} of 2 Shields">${ICON.shield((st.shields || 0) >= 1)}${ICON.shield((st.shields || 0) >= 2)}</span><span><b>${st.taken || 0}</b> drinks</span>`;
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
      const sh = st.shields ? `<span class="pips" role="img" aria-label="${st.shields} Shield${st.shields > 1 ? 's' : ''}">${ICON.shield(true).repeat(st.shields)}</span>` : '';
      return `<div class="seat ${id === act && g.phase === 'turns' ? 'active' : ''} ${isMe(id) ? 'me' : ''} ${p.online === false && !p.bot ? 'off' : ''}"><div class="seat-top"><span class="nm">${esc(isMe(id) ? 'You' : (p.name || '?'))}</span>${sh}<span class="pts" aria-label="${st.points || 0} points">${st.points || 0}</span></div><div class="seat-cards" role="img" aria-label="${shown ? 'Cards shown: ' + esc(shown) : 'No cards shown yet'}">${cards}</div></div>`;
    }).join('');
  }

  /* ---------- wheel overlay ---------- */
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
      labels += `<text transform="rotate(${45 * i})" x="0" y="-84" text-anchor="middle" dominant-baseline="middle" style="fill:${inks[i % 4]}">${esc(s.label)}</text>`;
    });
    const list = wheel.slices.map(s => s.label.toLowerCase()).join(', ');
    return `<div class="wheel-box"><div class="wheel-disc"><svg viewBox="-130 -130 260 260" role="img" aria-label="Wheel: ${esc(list)}">${paths}<g class="wheel-labels">${labels}</g></svg></div><div class="wheel-hub" aria-hidden="true"></div><svg class="wheel-pointer" viewBox="0 0 26 30" aria-hidden="true"><path d="M2 2H24L13 28Z" style="fill:var(--bone);stroke:var(--ground);stroke-width:3;stroke-linejoin:round"/></svg></div>`;
  }
  function sliceText(sl, correct, pid) {
    const t = sl.type;
    if (t === 'all') return sl.n === 1 ? 'Social! Everyone drinks.' : `Social! Everyone drinks ${sl.n === 2 ? 'twice' : sl.n + ' times'}.`;
    if (t === 'group') return sl.text;
    if (t === 'none') return correct ? 'Free pass. Nothing happens.' : 'Lucky. Nothing happens.';
    if (t === 'shield') return correct ? 'Bonus Shield!' : 'Pass. Nothing happens.';
    if (correct) return addr(pid, t === 'drinks' ? `Give out ${sl.n} drinks` : sl.give);
    return addr(pid, t === 'drinks' ? `Take ${sl.n} drinks` : sl.take);
  }

  function renderOverlay() {
    const g = G();
    if (!g || g.phase !== 'turns' || g.step === 'guess') {
      if (C.ovKey) { closeOverlay(); C.ovKey = null; }
      clearTimeout(C.ovTimer); C.ovTimer = 0;
      return;
    }
    const key = g.key + ':' + g.turnId, t = now();
    if (C.ovKey !== key) {
      const openAt = g.stepAt + 900;
      if ((g.step === 'spin' || g.step === 'social') && t < openAt) {
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
    const wheel = wheels()[r - 1];
    const note = correct ? (me ? 'You spin, and you hand it out.' : `${nameOf(pid)} spins and hands it out.`) : (me ? 'You spin, and it’s on you.' : `${nameOf(pid)} spins, and it’s on them.`);
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
    const remaining = g.stepAt + IP.SPIN_MS - 150 - now();
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
    const sl = currentSlice(), say = $('#ovSay');
    if (sl && say) {
      say.hidden = false;
      say.innerHTML = `<div class="say"><p class="eyebrow">The wheel says</p><p class="big" id="sayBig">${esc(sliceText(sl, g.outcome === 'correct', activeId()))}</p></div>`;
      announce('The wheel says: ' + sliceText(sl, g.outcome === 'correct', activeId()));
    }
  }
  function updateOverlay() {
    const g = G(), pid = activeId(), me = isMe(pid), key = g.key + ':' + g.turnId;
    if (g.outcome !== 'social' && g.outcome !== 'skipped' && g.step !== 'spin' && !C.ovLanded) {
      const disc = $('#ovBody .wheel-disc');
      if (disc) { clearTimeout(C.landTimer); disc.style.transition = 'none'; disc.style.transform = `rotate(${360 * 5 + (((-45 * g.slice) % 360) + 360) % 360 + (g.jitter || 0)}deg)`; }
      landWheel();
    }
    const actKey = key + ':' + g.step;
    if (C.ovAct !== actKey) {
      C.ovAct = actKey;
      renderAct(g, pid, me);
    }
    const host = isHost();
    const footKey = actKey + ':' + host;
    if (C.ovFoot !== footKey) {
      C.ovFoot = footKey;
      const foot = $('#ovFoot');
      if (foot) {
        if (g.step === 'done' || g.step === 'social') {
          const p = players()[pid] || {};
          if (me || host) foot.innerHTML = `<button type="button" class="btn btn-primary btn-block" id="ovNext">${me ? 'Next turn' : (p.bot ? 'Next' : 'Next (host)')}</button>`;
          else foot.innerHTML = `<p class="muted center">Waiting for ${esc(nameOf(pid))} to tap Next…</p>`;
          const b = $('#ovNext');
          if (b) { b.onclick = () => { b.disabled = true; send('next'); }; if (me) b.focus({ preventScroll: true }); }
        } else foot.innerHTML = '';
      }
    }
  }
  function renderAct(g, pid, me) {
    const act = $('#ovAct');
    if (!act) return;
    const sl = currentSlice(), name = nameOf(pid);
    act.onclick = null;
    if (g.step === 'pick') {
      if (!me) { act.innerHTML = `<p class="wait-line">${esc(name)} is choosing who gets it…</p>`; return; }
      if (sl.type === 'drinks') pickDistribution(act, sl.n, pid); else pickOne(act, pid);
      return;
    }
    if (g.step === 'shield') {
      if (!me) { act.innerHTML = `<p class="wait-line">${esc(name)} is deciding whether to use a Shield…</p>`; return; }
      askShield(act, sl);
      return;
    }
    if (g.step === 'done') { act.innerHTML = resultHTML(g, pid, sl); return; }
    act.innerHTML = '';
  }
  function resultHTML(g, pid, sl) {
    const R = g.result || {}, me = isMe(pid);
    if (R.t === 'gave') {
      const d = R.dist || {}, ids = Object.keys(d);
      const mine = ids.indexOf(C.pid) !== -1;
      return `<p class="result-line ${mine ? 'mine' : ''}">${ids.map(id => `<span class="${isMe(id) ? 'you-name' : ''}">${esc(disp(id))} ×${d[id]}</span>`).join(' · ')}</p>`;
    }
    if (R.t === 'picked' && sl) {
      return `<p class="result-line ${isMe(R.target) ? 'mine' : ''}"><span class="${isMe(R.target) ? 'you-name' : ''}">${esc(disp(R.target))}</span>: ${esc(sl.done)}</p>`;
    }
    if (R.t === 'take' && R.blocked) {
      const big = $('#sayBig'); if (big) big.classList.add('struck');
      return `<p class="result-line shielded">${ICON.shield(true)}<span>${me ? 'Blocked by your Shield' : esc(nameOf(pid)) + ' used a Shield'}</span></p>`;
    }
    if (R.t === 'shield') return `<p class="result-line ${me ? 'mine' : ''}">${R.full ? 'Shields are full, so it’s a bonus point instead.' : (me ? 'You now hold a new Shield.' : esc(nameOf(pid)) + ' now holds a new Shield.')}</p>`;
    if (R.t === 'skipped') return '<p class="result-line">Turn skipped.</p>';
    return '';
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
  function pickOne(act, pid) {
    const others = arr(G().order).filter(q => q !== pid);
    let sel = null;
    const draw = () => {
      act.innerHTML = `<div class="picker"><p class="picker-head"><span>Tap who it goes to</span></p>
        <div class="chips">${others.map(id => `<button type="button" class="chip ${sel === id ? 'on' : ''}" data-id="${esc(id)}" aria-pressed="${sel === id}">${esc(nameOf(id))}</button>`).join('')}</div>
        <div class="picker-actions"><button type="button" class="btn-text" data-act="random">Random</button><button type="button" class="btn btn-primary" data-act="send" ${sel === null ? 'disabled' : ''}>Send it</button></div></div>`;
    };
    draw();
    act.onclick = e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.id) { sel = b.dataset.id; draw(); const f = act.querySelector('[data-act="send"]'); if (f) f.focus({ preventScroll: true }); }
      else if (b.dataset.act === 'random') { sel = others[Math.floor(Math.random() * others.length)]; draw(); }
      else if (b.dataset.act === 'send' && sel !== null) { act.onclick = null; b.disabled = true; b.textContent = 'Sending…'; send('pick', { target: sel }); }
    };
  }
  function askShield(act, sl) {
    const st = stats(C.pid);
    const text = sl.type === 'drinks' ? `take ${sl.n} drinks` : lowerFirst(sl.take);
    act.innerHTML = `<div class="shield-ask"><div class="shield-badge">${ICON.shield(false)}</div><h2 class="display" style="font-size:26px">Use a Shield?</h2><p class="muted">Skip “${esc(text)}”. You hold ${st.shields || 0} of 2, and everyone sees you play it.</p><div class="two"><button type="button" class="btn btn-ghost" data-a="take">Take it</button><button type="button" class="btn btn-primary" data-a="use">Use Shield</button></div></div>`;
    const btn = act.querySelector('[data-a="use"]');
    if (btn) btn.focus({ preventScroll: true });
    act.onclick = e => {
      const b = e.target.closest('button[data-a]');
      if (!b) return;
      act.onclick = null;
      act.querySelectorAll('button').forEach(x => { x.disabled = true; });
      send('shield', { use: b.dataset.a === 'use' });
    };
  }

  /* ---------- mini games ---------- */
  function miniKeyOf(g) { return g.key + ':' + g.mini.round; }
  function buildMiniIntro() {
    const g = G(), M = IP.MINI_META[g.mini.gameId], prize = g.mini.prize;
    setMain(`<section class="screen mini-intro" aria-label="Mini game">
      <p class="eyebrow">Mini game · after round ${g.mini.round}</p>
      <h1 class="display">${esc(M.name)}</h1>
      <p><span class="tag">${esc(M.tag)}</span></p>
      <p class="how">${esc(M.how)}</p>
      <div class="prize">${prize === 'shield' ? ICON.shield(true) : ICON.star}<div><p class="prize-title">${prize === 'shield' ? 'Winner gets a Shield' : 'Winner gets a bonus point'}</p><p class="muted small">${prize === 'shield' ? 'It skips one punishment later. You can hold 2.' : 'Last mini game of the night. One point can flip the podium.'}</p></div></div>
      <button type="button" class="btn btn-primary btn-block" id="miniReady">I’m ready</button>
      <div class="ready-wrap"><p class="eyebrow">Ready</p><ul class="ready-list" id="readyList"></ul></div>
      ${isHost() ? '<button type="button" class="btn btn-ghost btn-block" id="miniForce">Start without waiting</button>' : ''}
      <p class="muted small">Everyone starts together when the whole table is ready.</p>
    </section>`);
    announce(`Mini game: ${M.name}. ${M.how}`);
    const k = miniKeyOf(g);
    $('#miniReady').onclick = () => {
      requestWake();
      const UIg = IP.MINI_UI[g.mini.gameId];
      if (!C.miniPrep[k]) C.miniPrep[k] = UIg.prepare ? UIg.prepare() : Promise.resolve(null);
      C.db.set(`${C.base}/game/mini/ready/${C.pid}`, true);
    };
    const f = $('#miniForce');
    if (f) f.onclick = () => { f.disabled = true; send('miniStart'); };
  }
  function updateMiniIntro() {
    const g = G(), ready = g.mini.ready || {}, ps = players();
    const ids = arr(g.order).filter(id => ps[id]);
    const mine = !!ready[C.pid];
    const b = $('#miniReady');
    b.disabled = mine;
    b.textContent = mine ? 'You’re ready' : 'I’m ready';
    $('#readyList').innerHTML = ids.map(id => `<li class="${ready[id] ? 'ok' : ''} ${ps[id].online === false && !ps[id].bot ? 'off' : ''}">${ready[id] ? ICON.check : '<span class="dot" aria-hidden="true"></span>'}<span>${esc(disp(id))}</span><span class="sr-only">${ready[id] ? 'ready' : 'not ready'}</span></li>`).join('');
  }

  function buildMiniPlay() {
    const g = G(), mini = g.mini, M = IP.MINI_META[mini.gameId], UIg = IP.MINI_UI[mini.gameId];
    const k = miniKeyOf(g);
    C.miniKey = k; C.miniDone = null;
    setMain(`<section class="screen" aria-label="${esc(M.name)}">
      <div class="mini-hud"><p class="eyebrow">${esc(M.name)}</p><span class="timer-pill"><span id="miniTimerTxt">${M.live ? '0:' + String(Math.round(M.dur / 1000)).padStart(2, '0') : ''}</span></span></div>
      ${M.live ? '<div class="live" id="miniLive" aria-live="off"></div>' : ''}
      <div class="stage" id="miniStage"></div>
      <div id="miniWait"></div>
    </section>`);
    const t = now();
    if (t > mini.startAt + 2500 || !players()[C.pid]) {
      $('#miniStage').innerHTML = '<p class="lede">This mini game already started. You’ll be in the next one.</p>';
      C.miniDone = { skipped: true };
      return;
    }
    const data = M.setup ? M.setup(IP.mulberry32(mini.seed)) : null;
    const timerTxt = $('#miniTimerTxt');
    let liveIv = 0, lastLive = 0, liveVal = 0, liveSent = -1;
    const pushLive = force => {
      const n = Date.now();
      if (!force && n - lastLive < 450) return;
      if (liveVal === liveSent) return;
      lastLive = n; liveSent = liveVal;
      C.db.set(`${C.base}/game/mini/live/${C.pid}`, liveVal);
    };
    const ctx = {
      myLive: 0,
      start(dur) {
        const t0 = performance.now();
        const tick = () => {
          const left = Math.max(0, dur - (performance.now() - t0));
          timerTxt.textContent = `0:${String(Math.ceil(left / 1000)).padStart(2, '0')}`;
          pushLive(false);
          if (left <= 0) clearInterval(liveIv);
        };
        tick();
        liveIv = setInterval(tick, 200);
      },
      setScore(n) { liveVal = n; ctx.myLive = n; renderLive(); pushLive(false); },
      setTimerText(txt) { timerTxt.textContent = txt; }
    };
    C.miniCtx = ctx;
    const cd = document.createElement('div');
    cd.className = 'countdown';
    cd.setAttribute('aria-live', 'assertive');
    document.body.appendChild(cd);
    let shown = '';
    const step = () => {
      if (C.miniKey !== k) { cd.remove(); return; }
      const left = mini.startAt - now();
      const label = left > 2000 ? '3' : left > 1000 ? '2' : left > 0 ? '1' : 'Go!';
      if (label !== shown) { shown = label; cd.innerHTML = `<span>${label}</span>`; }
      if (left > -400) { setTimeout(step, 50); return; }
      cd.remove();
      Promise.resolve(C.miniPrep[k] || null).then(prep => UIg.run($('#miniStage'), ctx, data, prep)).then(res => {
        clearInterval(liveIv);
        if (C.miniKey !== k) return;
        liveVal = res.score; pushLive(true);
        const out = { score: res.score, tb: res.tb || 0, done: true };
        if (res.extra !== undefined) out.extra = res.extra;
        C.db.set(`${C.base}/game/mini/scores/${C.pid}`, out);
        C.miniDone = res;
        schedule();
      }).catch(e => { console.error(e); C.miniDone = { error: true }; schedule(); });
    };
    step();
  }
  function renderLive() {
    const g = G(), el = $('#miniLive');
    if (!el || !g || g.phase !== 'mini-play') return;
    const M = IP.MINI_META[g.mini.gameId], live = g.mini.live || {};
    const rows = arr(g.order).filter(id => players()[id]).map(id => ({ id, v: isMe(id) ? ((C.miniCtx && C.miniCtx.myLive) || 0) : (live[id] || 0) }));
    rows.sort((a, b) => b.v - a.v);
    const top = rows.slice(0, 4);
    if (!top.some(r => isMe(r.id))) { const mine = rows.find(r => isMe(r.id)); if (mine) top[top.length - 1] = mine; }
    el.innerHTML = top.map(r => `<span class="${isMe(r.id) ? 'me' : ''}"><b>${r.v}${M.unit || ''}</b> ${esc(disp(r.id))}</span>`).join('');
  }
  function updateMiniPlay() {
    renderLive();
    const g = G(), w = $('#miniWait');
    if (!w || !C.miniDone) return;
    const scores = g.mini.scores || {}, ps = players();
    const M = IP.MINI_META[g.mini.gameId];
    const humans = arr(g.order).filter(id => ps[id] && !ps[id].bot);
    const mine = C.miniDone.skipped || C.miniDone.error ? '' : `<p class="eyebrow">Your score</p><p class="display your-score">${esc(M.fmt(C.miniDone))}</p>`;
    w.innerHTML = `<div class="waiting">${mine}<p class="muted">Waiting for everyone to finish…</p><ul class="ready-list">${humans.map(id => `<li class="${scores[id] && scores[id].done ? 'ok' : ''}">${scores[id] && scores[id].done ? ICON.check : '<span class="dot" aria-hidden="true"></span>'}<span>${esc(disp(id))}</span></li>`).join('')}</ul></div>`;
  }

  function buildMiniResults() {
    C.miniKey = null;
    const g = G(), mini = g.mini, M = IP.MINI_META[mini.gameId];
    const w = mini.winner;
    const kind = mini.prizeKind;
    let prizeText = 'Nobody finished, so no prize this time.';
    if (w) {
      if (kind === 'shield') prizeText = `${isMe(w) ? 'You get' : nameOf(w) + ' gets'} a Shield.`;
      else if (kind === 'point-full') prizeText = `${isMe(w) ? 'You already hold' : nameOf(w) + ' already holds'} 2 Shields, so it’s a bonus point instead.`;
      else prizeText = `${isMe(w) ? 'You get' : nameOf(w) + ' gets'} a bonus point.`;
    }
    const rows = arr(mini.results);
    setMain(`<section class="screen mini-intro" aria-label="${esc(M.name)} results">
      <p class="eyebrow">${esc(M.name)} · results</p>
      <h1 class="display">${w ? (isMe(w) ? 'You win!' : esc(nameOf(w)) + ' wins!') : 'No winner'}</h1>
      <p class="muted">${esc(prizeText)}${mini.tie ? ' Won the tie-break.' : ''}</p>
      ${kind === 'shield' ? `<div class="shield-card">${ICON.shield(false)}<p class="display">Shield</p><p class="muted small">Skip one punishment</p></div>` : ''}
      <ol class="res-list">${rows.map((r, i) => `<li class="res-row ${isMe(r.pid) ? 'me' : ''} ${r.pid === w ? 'win' : ''}"><span class="res-rank">${r.missing ? '–' : i + 1}</span><span class="res-name">${esc(disp(r.pid))}</span><span class="res-score">${r.missing ? 'No score' : esc(M.fmt(r))}${!r.missing && M.sub ? `<small>${esc(M.sub(r))}</small>` : ''}</span></li>`).join('')}</ol>
      <div id="miniNext"></div>
    </section>`);
    if (w) announce(`${isMe(w) ? 'You win' : nameOf(w) + ' wins'} ${M.name}. ${prizeText}`);
    if (w && isMe(w)) vibrate([60, 40, 60]);
  }
  function updateMiniResults() {
    const g = G(), el = $('#miniNext');
    const label = g.mini.round < 4 ? `On to round ${g.mini.round + 1}` : 'See the leaderboard';
    const k = (isHost() ? 'h' : 'g') + g.mini.round;
    if (el.dataset.k === k) return;
    el.dataset.k = k;
    if (isHost()) { el.innerHTML = `<button type="button" class="btn btn-primary btn-block" id="miniDone">${label}</button>`; $('#miniDone').onclick = e => { e.currentTarget.disabled = true; send('miniContinue'); }; }
    else el.innerHTML = `<p class="waiting-line">Waiting for ${esc(nameOf(C.S.hostId))} to continue…</p>`;
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
    if (sorted[1] && (st(sorted[1]).points || 0) === (st(w).points || 0)) why = (st(sorted[1]).miniWins || 0) < (st(w).miniWins || 0) ? 'Won on mini games' : 'Won the spin-off';
    const most = key => sorted.reduce((a, b) => ((st(b)[key] || 0) > (st(a)[key] || 0) ? b : a), sorted[0]);
    const pun = most('taken'), gen = most('given'), mvp = most('miniWins');
    const pod = (id, n) => id ? `<div class="pod p${n} ${isMe(id) ? 'me' : ''}">${n === 1 ? ICON.crown : ''}<p class="place">${n}</p><span class="av" aria-hidden="true">${esc(nameOf(id).charAt(0).toUpperCase())}</span><p class="nm">${esc(disp(id))}</p><p class="pts-line">${st(id).points || 0} pts</p>${n === 1 ? `<p class="why">${esc(why)}</p>` : ''}</div>` : '<div></div>';
    setMain(`<section class="screen" aria-label="Leaderboard">
      <div class="hero"><p class="eyebrow">Game over · 4 rounds</p><h1 class="display">Leaderboard</h1></div>
      <div class="podium">${pod(sorted[1], 2)}${pod(sorted[0], 1)}${pod(sorted[2], 3)}</div>
      <div class="awards">
        <div class="award"><p class="eyebrow">Most punished</p><p>${esc(disp(pun))} · ${st(pun).taken || 0} drinks</p></div>
        <div class="award"><p class="eyebrow">Most generous</p><p>${esc(disp(gen))} · gave ${st(gen).given || 0}</p></div>
        ${(st(mvp).miniWins || 0) ? `<div class="award"><p class="eyebrow">Mini-game MVP</p><p>${esc(disp(mvp))} · ${st(mvp).miniWins} win${st(mvp).miniWins > 1 ? 's' : ''}</p></div>` : ''}
      </div>
      <ol class="res-list" aria-label="Everyone else">${sorted.slice(3).map(id => `<li class="res-row ${isMe(id) ? 'me' : ''}"><span class="res-rank">${place(id)}</span><span class="res-name">${esc(disp(id))}</span><span class="res-score">${st(id).points || 0} pts</span></li>`).join('')}</ol>
      <div id="endActions"></div>
      <div class="leave-row"><button type="button" class="btn-text" id="leaveBtn" data-label="Leave">Leave</button></div>
    </section>`);
    $('#leaveBtn').onclick = e => confirmLeave(e.currentTarget);
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
