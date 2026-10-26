// Phone screens for the wheel games and mini games. app.js handles the shared parts
// (the ready check, the Shield check, results and the host controls); each entry here
// supplies the explainer text, its own stages and its results.
(function (IP) {
  'use strict';
  const SUIT_CH = { h: '♥︎', d: '♦︎', c: '♣︎', s: '♠︎' };
  const SUIT_NAME = { h: 'Hearts', d: 'Diamonds', c: 'Clubs', s: 'Spades' };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const money = c => '$' + (Math.max(0, c) / 100).toFixed(2);
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : (/s$/.test(w) ? 'es' : 's')}`;
  const drinks = n => plural(n, 'drink');
  IP.money = money;

  function mulberry32(seed) { let a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // What the spinner's guess means for this wheel game, from my point of view.
  function spinnerPart(u, rightMe, wrongMe, other) {
    const A = u.A;
    if (u.isMe(A.sp)) return A.right ? rightMe : wrongMe;
    return other + ' ' + (A.right ? `${u.nameOf(A.sp)} guessed right, so they sit out.` : `${u.nameOf(A.sp)} guessed wrong, so they drink 1 and play too.`);
  }
  const prizeName = A => A.prize === 'brag' ? 'bragging rights' : 'a Shield';
  const countIn = (u, ids, ok) => ids.filter(id => ok(u.inputs()[id])).length;
  const statusLine = (u, ids, ok, verb) => {
    const live = ids.filter(id => u.isOn(id));
    return `${countIn(u, live, ok)} of ${live.length} ${verb}`;
  };

  /* Icons for Guess the Price products */
  const PROD_ICON = {
    candy: '<path d="M8 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0M8 12l-5-3v6zM16 12l5-3v6z"/>',
    food: '<path d="M4 11h16M5 11a7 7 0 0 1 14 0M4 15h16M6 15v2a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-2"/>',
    drink: '<path d="M7 4h10l-1.2 15a2 2 0 0 1-2 2h-3.6a2 2 0 0 1-2-2zM6.6 9h10.8"/>',
    halloween: '<path d="M12 6c-1-2 0-3 2-3M6 13a6 6 0 1 0 12 0a6 6 0 1 0-12 0M9.5 12l1-1.5 1 1.5M12.5 12l1-1.5 1 1.5M9.5 15.5q2.5 2 5 0"/>',
    tech: '<path d="M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM11 18h2"/>',
    home: '<path d="M7 4h10l-1 16H8zM7 8h10M17 10h1.5a1.5 1.5 0 0 1 0 5H16.6"/>',
    clothing: '<path d="M3 15c0-2 1-3 3-3l5-1 3-4 3 1-1 4 4 1c1 0 1 2 1 3H3zM3 15v2h18v-2"/>',
    toy: '<path d="M5 5h14v14H5zM9 9h.01M15 9h.01M12 12h.01M9 15h.01M15 15h.01"/>',
    misc: '<path d="M4 12l8-8h7v7l-8 8zM15.5 8.5h.01"/>'
  };
  const prodIcon = cat => `<svg class="prod-ico" viewBox="0 0 24 24" aria-hidden="true">${PROD_ICON[cat] || PROD_ICON.misc}</svg>`;

  const DOOR_SVG = n => `<svg viewBox="0 0 60 90" aria-hidden="true"><path d="M6 88V12a24 10 0 0 1 48 0v76z" class="door-frame"/><path d="M12 88V16a18 8 0 0 1 36 0v72z" class="door-panel"/><circle cx="41" cy="54" r="2.6" class="door-knob"/><text x="30" y="42" text-anchor="middle" class="door-num">${n}</text></svg>`;
  const CHAIR_SVG = '<svg viewBox="0 0 40 48" aria-hidden="true"><path d="M10 4h20v20H10zM6 24h28v6H6zM9 30v16M31 30v16M13 30v10M27 30v10"/></svg>';
  const BOMB_SVG = '<svg viewBox="0 0 80 80" aria-hidden="true"><circle cx="36" cy="46" r="26" class="bomb-body"/><path d="M50 22l6-6" class="bomb-neck"/><path d="M56 16q6-6 10 0" class="bomb-fuse"/><circle cx="67" cy="13" r="4" class="bomb-spark"/><circle cx="27" cy="38" r="5" class="bomb-shine"/></svg>';

  // Cards Against Humanity: put the white card text into the black card's blanks.
  function fillBlack(u, black, whites) {
    const parts = black.split('_');
    const ws = whites.map(w => u.esc(w));
    const strip = s => s.replace(/\.$/, '');
    if (parts.length === 1) return `${u.esc(black)} <b>${ws.join(' / ')}</b>`;
    let out = '';
    parts.forEach((p, i) => {
      out += u.esc(p);
      if (i < parts.length - 1) out += `<b>${ws[i] !== undefined ? strip(ws[i]) : '____'}</b>`;
    });
    return out;
  }
  const blackHTML = (u, t) => `<div class="cah-black"><p>${u.esc(t).replace(/_/g, '<span class="blank">______</span>')}</p><span class="cah-mark">Cards Against Humanity</span></div>`;

  const UI = {};

  /* ---------------- Phone vote ---------------- */
  UI.vote = {
    intro(u) {
      return {
        what: `A “Most likely to…” question pops up on every phone. You get 10 seconds to vote for someone, and you can’t vote for yourself. Whoever gets the most votes drinks ${u.n}. A tie means every tied player drinks.`,
        part: spinnerPart(u, 'You guessed right, so nobody can vote for you. You still get a vote.', 'You guessed wrong: you drink 1, and you’re on the ballot.', 'You’re on the ballot.')
      };
    },
    stages: {
      vote: {
        build(u, el) {
          const A = u.A, cands = u.arr(A.cands).filter(id => !u.isMe(id));
          el.innerHTML = `<div class="prompt-card"><p class="eyebrow">Vote</p><p class="prompt">${u.esc(A.d.prompt)}</p></div>
            <div class="choice-grid" id="vGrid">${cands.map(id => `<button type="button" class="btn choice" data-v="${u.esc(id)}">${u.esc(u.nameOf(id))}</button>`).join('')}</div>
            <p class="muted small center" id="vStatus"></p>`;
          u.on(el, '#vGrid', id => { u.input(id); u.lockChoices(el, '#vGrid', id); });
        },
        update(u, el) {
          const mine = u.inputs()[u.me];
          if (typeof mine === 'string') u.lockChoices(el, '#vGrid', mine);
          el.querySelector('#vStatus').textContent = statusLine(u, u.arr(u.A.voters), v => typeof v === 'string', 'voted');
        }
      }
    },
    results(u) {
      const R = u.A.res || {}, counts = R.counts || {};
      const ids = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
      const max = Math.max(1, ...ids.map(i => counts[i]));
      const losers = u.arr(R.losers);
      return `<div class="prompt-card"><p class="prompt">${u.esc(u.A.d.prompt)}</p></div>
        <ul class="bars">${ids.map(id => `<li class="${losers.indexOf(id) !== -1 ? 'hot' : ''}"><span class="bn">${u.esc(u.disp(id))}</span><span class="bt"><span class="bf" style="width:${Math.round(counts[id] / max * 100)}%"></span></span><span class="bc">${counts[id]}</span></li>`).join('')}</ul>
        <p class="outcome">${losers.length ? `${u.list(losers)} got the most votes.` : 'Nobody voted, so nobody drinks.'}</p>`;
    }
  };

  /* ---------------- Hot potato ---------------- */
  UI.potato = {
    intro(u) {
      return {
        what: `A bomb with a hidden fuse lands on a phone. If it’s on yours, tap a name to pass it on, fast. The fuse runs somewhere between 10 and 25 seconds, and whoever’s holding the bomb when it blows drinks ${u.n}.`,
        part: spinnerPart(u, 'You guessed right: you throw it first, and nobody can pass it back to you.', 'You guessed wrong: you drink 1, and the bomb starts in your hands.', `It starts with ${u.nameOf(u.A.start)}, and it can land on you any second.`)
      };
    },
    stages: {
      live: {
        build(u, el) {
          el.innerHTML = `<div class="bomb-wrap"><div class="bomb">${BOMB_SVG}</div><p class="bomb-holder" id="bHolder" aria-live="assertive"></p></div><div id="bPass"></div><p class="muted small center">The fuse is hidden. Pass it before it blows.</p>`;
          el.querySelector('#bPass').addEventListener('click', e => {
            const b = e.target.closest('button[data-to]');
            const B = u.G.bomb;
            if (!b || !B || !u.isMe(B.h)) return;
            el.querySelectorAll('#bPass button').forEach(x => { x.disabled = true; });
            const k = B.k, to = b.dataset.to, me = u.me;
            u.tx('game/bomb', cur => (cur.h === me && cur.k === k) ? { h: to, k: k + 1, at: u.now() } : undefined);
          });
        },
        update(u, el) {
          const B = u.G.bomb, A = u.A;
          if (!B) return;
          const key = B.h + ':' + B.k;
          if (u.st.bombKey === key) return;
          u.st.bombKey = key;
          const mine = u.isMe(B.h);
          el.querySelector('.bomb-wrap').classList.toggle('mine', mine);
          el.querySelector('#bHolder').innerHTML = mine ? '<b>You have the bomb!</b> Pass it!' : `<b>${u.esc(u.nameOf(B.h))}</b> has the bomb`;
          const targets = u.arr(A.targets).filter(id => id !== B.h);
          el.querySelector('#bPass').innerHTML = mine ? `<div class="choice-grid">${targets.map(id => `<button type="button" class="btn choice hot" data-to="${u.esc(id)}">${u.esc(u.nameOf(id))}</button>`).join('')}</div>` : '';
          if (mine) u.vibrate([80, 40, 80]);
        }
      },
      boom: {
        build(u, el) {
          el.innerHTML = `<div class="boom"><p class="boom-word">BOOM</p><p class="lede"><b>${u.esc(u.disp(u.A.loser))}</b> ${u.isMe(u.A.loser) ? 'were' : 'was'} holding it.</p></div>`;
          if (u.isMe(u.A.loser)) u.vibrate(300);
        },
        update() {}
      }
    },
    results(u) {
      const R = u.A.res || {};
      return `<p class="outcome">The bomb blew up on <b>${u.esc(u.disp(R.loser))}</b> after ${plural(R.passes || 0, 'pass')}.</p>`;
    }
  };

  /* ---------------- Trapdoor ---------------- */
  UI.trap = {
    intro(u) {
      return {
        what: `Four doors show up on every phone. Pick one within 10 seconds. Then one door turns out to be a trapdoor, and everyone who picked it drinks ${u.n}.`,
        part: spinnerPart(u, 'You guessed right, so you sit this one out and watch.', 'You guessed wrong: you drink 1, then pick a door like everyone else.', 'Pick a door.')
      };
    },
    stages: {
      pick: {
        build(u, el) {
          const inIt = u.arr(u.A.pl).indexOf(u.me) !== -1;
          el.innerHTML = `${inIt ? '<p class="lede center">Pick a door.</p>' : '<p class="lede center">You’re sitting this one out.</p>'}
            <div class="doors" id="dGrid">${[1, 2, 3, 4].map(n => `<button type="button" class="door" data-v="${n}" aria-label="Door ${n}" ${inIt ? '' : 'disabled'}>${DOOR_SVG(n)}</button>`).join('')}</div>
            <p class="muted small center" id="dStatus"></p>`;
          if (inIt) u.on(el, '#dGrid', v => { u.input(Number(v)); u.lockChoices(el, '#dGrid', v); }, '.door');
        },
        update(u, el) {
          const mine = u.inputs()[u.me];
          if (mine) u.lockChoices(el, '#dGrid', String(mine), '.door');
          el.querySelector('#dStatus').textContent = statusLine(u, u.arr(u.A.pl), v => v >= 1 && v <= 4, 'picked');
        }
      },
      reveal: {
        build(u, el) {
          const A = u.A, doors = A.doors || {};
          el.innerHTML = `<p class="lede center" id="tLine">Opening the trapdoor…</p>
            <div class="doors reveal">${[1, 2, 3, 4].map(n => `<div class="door-col" data-n="${n}"><div class="door">${DOOR_SVG(n)}</div><p class="door-names">${Object.keys(doors).filter(id => doors[id] === n).map(id => u.esc(u.disp(id))).join('<br>') || '<span class="muted">nobody</span>'}</p></div>`).join('')}</div>`;
          u.later(1600, () => {
            const col = el.querySelector(`.door-col[data-n="${A.trap}"]`);
            if (col) col.classList.add('trap');
            const fell = Object.keys(doors).filter(id => doors[id] === A.trap);
            const line = el.querySelector('#tLine');
            if (line) line.innerHTML = `Door ${A.trap} was the trapdoor. ${fell.length ? `${u.list(fell)} fell through.` : 'Nobody fell through.'}`;
            if (fell.indexOf(u.me) !== -1) u.vibrate(250);
          });
        },
        update() {}
      }
    },
    results(u) {
      const R = u.A.res || {}, fell = u.arr(R.fell);
      return `<p class="outcome">Door ${R.trap} was the trapdoor. ${fell.length ? `${u.list(fell)} fell through.` : 'Nobody fell through.'}</p>`;
    }
  };

  /* ---------------- Musical chairs ---------------- */
  UI.chairs = {
    intro(u) {
      const A = u.A;
      return {
        what: `After a 3-2-1 countdown, ${plural(A.d.n, 'chair')} pop up for ${u.arr(A.pl).length} players. Tap one as fast as you can. Whoever’s left standing drinks ${u.n}. Each phone times its own tap, so a slow connection won’t cost you.`,
        part: spinnerPart(u, 'You guessed right, so you sit this one out and watch.', 'You guessed wrong: you drink 1, then race for a chair like everyone else.', 'Get your thumb ready.')
      };
    },
    stages: {
      go: {
        build(u, el) {
          const A = u.A, inIt = u.arr(A.pl).indexOf(u.me) !== -1;
          const rng = mulberry32(A.d.seed || 1);
          const cells = [];
          for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) cells.push([c, r]);
          for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = cells[i]; cells[i] = cells[j]; cells[j] = t; }
          const pos = cells.slice(0, A.d.n).map(([c, r]) => ({ x: 2 + c * 24.5 + rng() * 2.5, y: 4 + r * 32 + rng() * 8 }));
          el.innerHTML = `<div class="chairs-area" id="cArea"><p class="chairs-count" id="cCount" aria-live="assertive">3</p></div>
            <p class="lede center" id="cLine">${inIt ? 'Tap a chair the moment they appear.' : 'You’re watching this one.'}</p>`;
          const area = el.querySelector('#cArea');
          const goLocal = performance.now() + (A.go - u.now());
          let shownAt = 0, done = false;
          const loop = () => {
            if (!area.isConnected) return;
            const left = goLocal - performance.now();
            if (left > 0) {
              const n = Math.ceil(left / 1000);
              const cc = el.querySelector('#cCount');
              if (cc && cc.textContent !== String(n)) cc.textContent = String(Math.min(3, n));
              requestAnimationFrame(loop);
              return;
            }
            area.innerHTML = pos.map((p, i) => `<button type="button" class="chair" data-i="${i}" style="left:${p.x}%;top:${p.y}%" aria-label="Chair ${i + 1}" ${inIt ? '' : 'disabled'}>${CHAIR_SVG}<span class="who"></span></button>`).join('');
            requestAnimationFrame(t => { shownAt = t; });
            shownAt = performance.now();
          };
          requestAnimationFrame(loop);
          area.addEventListener('pointerdown', e => {
            const b = e.target.closest('.chair');
            if (!b || done || !inIt || !shownAt) return;
            e.preventDefault();
            done = true;
            const ms = Math.max(0, Math.round(performance.now() - shownAt));
            b.classList.add('mine');
            u.input({ ms });
            const line = el.querySelector('#cLine');
            if (line) line.innerHTML = `<b>Seated</b> in ${(ms / 1000).toFixed(2)} s`;
          });
          area.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.chair')) { e.preventDefault(); e.target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); } });
        },
        update(u, el) {
          const A = u.A, inp = u.inputs();
          if (u.now() < A.go) return;
          const sat = u.arr(A.pl).filter(id => inp[id] && typeof inp[id].ms === 'number').sort((a, b) => inp[a].ms - inp[b].ms);
          const chairs = el.querySelectorAll('.chair');
          let k = 0;
          sat.forEach(id => {
            if (u.isMe(id)) return;
            while (k < chairs.length && chairs[k].classList.contains('mine')) k++;
            if (k < chairs.length) { chairs[k].classList.add('taken'); chairs[k].querySelector('.who').textContent = u.nameOf(id).charAt(0).toUpperCase(); k++; }
          });
        }
      }
    },
    results(u) {
      const R = u.A.res || {}, standing = u.arr(R.standing);
      const ord = u.arr(R.order);
      return `<ol class="res-list">${ord.map((o, i) => `<li class="res-row ${u.isMe(o.id) ? 'me' : ''} ${standing.indexOf(o.id) !== -1 ? 'lose' : ''}"><span class="res-rank">${i + 1}</span><span class="res-name">${u.esc(u.disp(o.id))}</span><span class="res-score">${(o.ms / 1000).toFixed(2)} s</span></li>`).join('')}
        ${standing.filter(id => !ord.some(o => o.id === id)).map(id => `<li class="res-row lose ${u.isMe(id) ? 'me' : ''}"><span class="res-rank">–</span><span class="res-name">${u.esc(u.disp(id))}</span><span class="res-score">No tap</span></li>`).join('')}</ol>
        <p class="outcome">${standing.length ? `${u.list(standing)} got left standing.` : 'Everyone found a chair.'}</p>`;
    }
  };

  /* ---------------- Odd one out ---------------- */
  UI.odd = {
    intro(u) {
      return {
        what: `Everyone secretly picks one of two things. Whoever ends up in the smaller group drinks ${u.n}. An even split means everyone drinks, and if you all match, nobody does.`,
        part: spinnerPart(u, 'You guessed right, so you sit this one out and watch.', 'You guessed wrong: you drink 1, then pick like everyone else.', 'Think about what the rest of the room will pick.')
      };
    },
    stages: {
      pick: {
        build(u, el) {
          const q = u.A.d.q, inIt = u.arr(u.A.pl).indexOf(u.me) !== -1;
          el.innerHTML = `<div class="prompt-card"><p class="prompt">${u.esc(q.q)}</p></div>
            <div class="odd-grid" id="oGrid"><button type="button" class="btn odd-btn a" data-v="a" ${inIt ? '' : 'disabled'}>${u.esc(q.a)}</button><span class="or" aria-hidden="true">or</span><button type="button" class="btn odd-btn b" data-v="b" ${inIt ? '' : 'disabled'}>${u.esc(q.b)}</button></div>
            <p class="muted small center" id="oStatus">${inIt ? '' : 'You’re sitting this one out.'}</p>`;
          if (inIt) u.on(el, '#oGrid', v => { u.input(v); u.lockChoices(el, '#oGrid', v, '.odd-btn'); }, '.odd-btn');
        },
        update(u, el) {
          const mine = u.inputs()[u.me];
          if (mine) u.lockChoices(el, '#oGrid', mine, '.odd-btn');
          if (u.arr(u.A.pl).indexOf(u.me) !== -1) el.querySelector('#oStatus').textContent = statusLine(u, u.arr(u.A.pl), v => v === 'a' || v === 'b', 'picked');
        }
      }
    },
    results(u) {
      const R = u.A.res || {}, q = u.A.d.q, picks = R.picks || {};
      const ga = Object.keys(picks).filter(id => picks[id] === 'a'), gb = Object.keys(picks).filter(id => picks[id] === 'b');
      const col = (label, ids) => `<div class="group"><p class="group-h">${u.esc(label)} <span class="muted">${ids.length}</span></p><p>${ids.map(id => u.esc(u.disp(id))).join(', ') || '<span class="muted">nobody</span>'}</p></div>`;
      const line = R.why === 'all' ? 'Everyone matched, so nobody drinks.' : (R.why === 'even' ? 'An even split, so everyone drinks.' : `${u.list(u.arr(R.losers))} ended up in the smaller group.`);
      return `<div class="prompt-card"><p class="prompt">${u.esc(q.q)}</p></div><div class="groups">${col(q.a, ga)}${col(q.b, gb)}</div><p class="outcome">${line}</p>`;
    }
  };

  /* ---------------- Auction ---------------- */
  UI.auction = {
    intro(u) {
      const A = u.A, prize = prizeName(A), t = A.d.twist;
      const what = t === 'live'
        ? `Live auction for ${prize}. Bids show on every phone as they come in, and each bid has to beat the last one, up to 5 drinks. The clock resets after every bid. When it runs out, the highest bidder wins and drinks their bid.`
        : (t === 'allpay'
          ? `Everyone secretly bids 0 to 5 drinks for ${prize}, and this time <b>everyone pays</b>: every player drinks their own bid, win or lose. The highest bid wins.`
          : `Everyone secretly bids 0 to 5 drinks for ${prize}. All bids are revealed at the same time. The highest bid wins and drinks that many. A tie means a quick rebid between just the tied players.`);
      return { what, part: 'Whatever you bid is what you drink if you win, and a Shield can’t block it.', html: true, tag: t === 'live' ? 'Twist: live auction' : (t === 'allpay' ? 'Twist: everyone pays' : '') };
    },
    stages: {
      bid: { build: (u, el) => UI.auction.sealedBuild(u, el, false), update: (u, el) => UI.auction.sealedUpdate(u, el, false) },
      rebid: { build: (u, el) => UI.auction.sealedBuild(u, el, true), update: (u, el) => UI.auction.sealedUpdate(u, el, true) },
      live: {
        build(u, el) {
          el.innerHTML = `${u.prizeCard()}<div class="live-bid"><p class="eyebrow">Highest bid</p><p class="live-h" id="lH">0</p><p class="muted" id="lBy">No bids yet</p><p class="going" id="lGo"></p></div>
            <button type="button" class="btn btn-primary btn-block big-btn" id="lBtn">Bid 1 drink</button><ul class="bid-log" id="lLog"></ul>`;
          el.querySelector('#lBtn').addEventListener('click', () => {
            const L = u.G.live;
            if (!L || L.h >= 5 || L.by === u.me) return;
            const k = L.k, v = L.h + 1, me = u.me;
            u.tx('game/live', cur => (cur.k === k && cur.h < v && cur.by !== me) ? { h: v, by: me, at: u.now(), k: k + 1, log: u.arr(cur.log).concat([{ by: me, b: v }]).slice(-12) } : undefined);
          });
          u.every(200, () => UI.auction.liveClock(u, el));
        },
        update(u, el) {
          const L = u.G.live;
          if (!L) return;
          el.querySelector('#lH').textContent = String(L.h);
          el.querySelector('#lBy').textContent = L.by ? `by ${u.disp(L.by)}` : 'No bids yet';
          const btn = el.querySelector('#lBtn');
          btn.disabled = L.h >= 5 || L.by === u.me;
          btn.textContent = L.h >= 5 ? 'Maxed out at 5' : (L.by === u.me ? 'You’re the high bidder' : `Bid ${drinks(L.h + 1)}`);
          el.querySelector('#lLog').innerHTML = u.arr(L.log).slice().reverse().map(x => `<li><b>${u.esc(u.disp(x.by))}</b> bid ${x.b}</li>`).join('');
          UI.auction.liveClock(u, el);
        }
      }
    },
    liveClock(u, el) {
      const L = u.G.live, g = el.querySelector('#lGo');
      if (!L || !g) return;
      const quiet = (L.k ? 5000 : 9000) * (IP.TIME_SCALE || 1);
      const left = quiet - (u.now() - L.at);
      g.textContent = left <= 0 ? 'Sold!' : (L.k ? (left < quiet / 3 ? 'Going twice…' : (left < quiet * 2 / 3 ? 'Going once…' : '')) : `${Math.ceil(left / 1000 / (IP.TIME_SCALE || 1))} s to place the first bid`);
    },
    sealedBuild(u, el, re) {
      const A = u.A, bidders = re ? u.arr(A.tied) : u.arr(A.pl), inIt = bidders.indexOf(u.me) !== -1;
      const floor = re ? (A.top || 0) : 0;
      u.st.bid = floor;
      el.innerHTML = `${u.prizeCard()}
        ${re ? `<p class="lede">Tie at ${drinks(A.top)}! ${u.list(bidders)} rebid. Match it or go higher.</p>` : ''}
        ${inIt ? `<p class="eyebrow">Your secret bid</p><div class="bid-chips" id="bChips">${[0, 1, 2, 3, 4, 5].map(n => `<button type="button" class="bchip" data-v="${n}" ${n < floor ? 'disabled' : ''}>${n}</button>`).join('')}</div>
          <button type="button" class="btn btn-primary btn-block" id="bLock">Lock in ${drinks(floor)}</button>` : '<p class="lede">You’re watching this rebid.</p>'}
        <p class="muted small center" id="bStatus"></p>`;
      if (!inIt) return;
      const paint = () => {
        el.querySelectorAll('.bchip').forEach(b => b.classList.toggle('on', Number(b.dataset.v) === u.st.bid));
        el.querySelector('#bLock').textContent = `Lock in ${drinks(u.st.bid)}`;
      };
      paint();
      el.querySelector('#bChips').addEventListener('click', e => { const b = e.target.closest('.bchip'); if (!b || b.disabled || u.st.locked) return; u.st.bid = Number(b.dataset.v); paint(); });
      el.querySelector('#bLock').addEventListener('click', () => { if (u.st.locked) return; u.st.locked = true; u.input({ b: u.st.bid, lock: 1 }); UI.auction.sealedUpdate(u, el, re); });
    },
    sealedUpdate(u, el, re) {
      const A = u.A, bidders = re ? u.arr(A.tied) : u.arr(A.pl);
      const mine = u.inputs()[u.me];
      if (mine && mine.lock) {
        u.st.locked = true;
        el.querySelectorAll('.bchip').forEach(b => { b.disabled = true; b.classList.toggle('on', Number(b.dataset.v) === mine.b); });
        const l = el.querySelector('#bLock');
        if (l) { l.disabled = true; l.textContent = `Locked in: ${drinks(mine.b)}`; }
      }
      el.querySelector('#bStatus').textContent = statusLine(u, bidders, v => v && v.lock, 'locked in');
    },
    results(u) {
      const R = u.A.res || {};
      let body = '';
      if (R.twist === 'live') body = `<ul class="bid-log">${u.arr(R.log).map(x => `<li><b>${u.esc(u.disp(x.by))}</b> bid ${x.b}</li>`).join('') || '<li>Nobody bid.</li>'}</ul>`;
      else {
        const bids = Object.assign({}, R.bids || {}, R.rebids || {});
        const ids = Object.keys(bids).sort((a, b) => bids[b] - bids[a]);
        body = `<ol class="res-list">${ids.map(id => `<li class="res-row ${u.isMe(id) ? 'me' : ''} ${id === R.winner ? 'win' : ''}"><span class="res-rank"></span><span class="res-name">${u.esc(u.disp(id))}</span><span class="res-score">${drinks(bids[id])}${R.rebids && R.rebids[id] !== undefined ? '<small>rebid</small>' : ''}</span></li>`).join('')}</ol>`;
      }
      const line = R.winner ? `${u.esc(u.disp(R.winner))} won with ${drinks(R.paid)}.` : 'Nobody bid, so nobody wins.';
      return `${body}<p class="outcome">${line}${R.twist === 'allpay' ? ' Everyone drinks their own bid.' : ''}</p>`;
    }
  };

  /* ---------------- Imposter ---------------- */
  UI.imposter = {
    intro(u) {
      const A = u.A, d = A.d, two = u.arr(d.imps).length > 1;
      let what = `Everyone gets the same secret word, except the ${two ? '2 imposters' : 'imposter'}. Take turns saying one word out loud that hints at it, twice around the table. Then everyone votes on who the imposter is.`;
      let rules = d.mode === 'undercover'
        ? `Twist: undercover. The imposter gets a similar word and doesn’t know they’re the imposter. If the imposter isn’t caught, they win ${prizeName(A)} and everyone who voted for an innocent player drinks 2. If they’re caught, they drink 3, and whoever voted for them first wins.`
        : `If the imposter isn’t caught, they win ${prizeName(A)} and everyone who voted for an innocent player drinks 2. If they’re caught, they get one guess at the word from 6 options to still win. If they miss, they drink 3, and whoever voted for them first wins.`;
      return { what, extra: rules, part: 'Next you’ll see your secret card. Keep your screen to yourself.' };
    },
    myCard(u) {
      const d = u.A.d, imp = u.arr(d.imps).indexOf(u.me) !== -1;
      if (d.mode === 'undercover') return `<div class="secret"><p class="eyebrow">${u.esc(d.cat)}</p><p class="secret-word">${u.esc(imp ? d.alt : d.word)}</p><p class="muted small">This is your word. Somebody’s word is different.</p></div>`;
      if (imp) return `<div class="secret imp"><p class="eyebrow">${u.esc(d.cat)}</p><p class="secret-word">You’re the Imposter</p><p class="muted small">You don’t know the word. Blend in.</p></div>`;
      return `<div class="secret"><p class="eyebrow">${u.esc(d.cat)}</p><p class="secret-word">${u.esc(d.word)}</p><p class="muted small">Don’t say it. Hint at it.</p></div>`;
    },
    stages: {
      card: {
        gate: 'I’ve seen my card',
        top(u) { return UI.imposter.myCard(u); }
      },
      clues: {
        build(u, el) {
          el.innerHTML = `<p class="eyebrow" id="clLap"></p><div class="speaker" id="clNow" aria-live="polite"></div><div id="clMe"></div>
            <ol class="spk-list" id="clList"></ol>
            <details class="peek"><summary>Peek at my card</summary>${UI.imposter.myCard(u)}</details>`;
          el.querySelector('#clMe').addEventListener('click', e => { const b = e.target.closest('button[data-done]'); if (!b) return; b.disabled = true; u.send('clueDone', { sid: u.A.sid, ci: u.A.ci || 0 }); });
          u.every(250, () => UI.imposter.clueClock(u, el));
        },
        update(u, el) {
          const A = u.A, spk = u.arr(A.d.spk), ci = A.ci || 0, who = spk[ci % spk.length];
          el.querySelector('#clLap').textContent = `Lap ${Math.floor(ci / spk.length) + 1} of 2`;
          el.querySelector('#clList').innerHTML = spk.map((id, i) => `<li class="${id === who ? 'now' : ''} ${(ci >= spk.length || i < ci) && id !== who ? 'done' : ''}">${u.esc(u.disp(id))}${u.isBot(id) ? ' <span class="muted">(bot)</span>' : ''}</li>`).join('');
          const key = A.sid + ':' + ci;
          if (u.st.ck !== key) {
            u.st.ck = key;
            const me = u.isMe(who);
            el.querySelector('#clNow').innerHTML = me ? '<p class="speaker-name">Your turn</p><p class="muted">Say one word out loud that hints at your card.</p>' : `<p class="speaker-name">${u.esc(u.nameOf(who))}</p><p class="muted">${u.isBot(who) ? 'Bots can’t talk, so they pass.' : 'is giving a clue…'}</p>`;
            el.querySelector('#clMe').innerHTML = me ? '<button type="button" class="btn btn-primary btn-block" data-done="1">I said my word</button>' : (u.isHost() ? '<button type="button" class="btn-text" data-done="1">Host: next speaker</button>' : '');
            if (me) u.vibrate(60);
          }
          UI.imposter.clueClock(u, el);
        }
      },
      vote: {
        build(u, el) {
          const pl = u.arr(u.A.pl).filter(id => !u.isMe(id));
          el.innerHTML = `<p class="lede">Who’s the imposter?</p><div class="choice-grid" id="ivGrid">${pl.map(id => `<button type="button" class="btn choice" data-v="${u.esc(id)}">${u.esc(u.nameOf(id))}</button>`).join('')}</div><p class="muted small center" id="ivStatus"></p>`;
          u.on(el, '#ivGrid', id => { u.input({ t: id, at: u.now() }); u.lockChoices(el, '#ivGrid', id); });
        },
        update(u, el) {
          const mine = u.inputs()[u.me];
          if (mine && mine.t) u.lockChoices(el, '#ivGrid', mine.t);
          el.querySelector('#ivStatus').textContent = statusLine(u, u.arr(u.A.pl), v => v && v.t, 'voted');
        }
      },
      guess: {
        build(u, el) {
          const A = u.A, caught = u.arr(A.caught), me = caught.indexOf(u.me) !== -1;
          if (me) {
            el.innerHTML = `<p class="lede"><b>You got caught.</b> Guess the word to still win.</p><div class="choice-grid" id="igGrid">${u.arr((A.opts || {})[u.me]).map(w => `<button type="button" class="btn choice" data-v="${u.esc(w)}">${u.esc(w)}</button>`).join('')}</div>`;
            u.on(el, '#igGrid', w => { u.input(w); u.lockChoices(el, '#igGrid', w); });
          } else el.innerHTML = `<p class="lede">${u.list(caught)} got caught and ${caught.length > 1 ? 'are' : 'is'} guessing the word…</p>`;
        },
        update() {}
      }
    },
    clueClock(u, el) {
      const A = u.A, t = el.querySelector('#clNow');
      if (!t || A.stage !== 'clues') return;
      const left = Math.max(0, 15000 * (IP.TIME_SCALE || 1) - (u.now() - (A.cAt || A.at)));
      u.setTimer(Math.ceil(left / 1000 / (IP.TIME_SCALE || 1)));
    },
    results(u) {
      const A = u.A, d = A.d, R = A.res || {}, imps = u.arr(R.imps), caught = u.arr(R.caught), counts = A.counts || {};
      const ids = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
      let line;
      if (!caught.length) line = `${u.list(imps)} got away with it.`;
      else if (u.arr(R.right).length) line = `${u.list(caught)} got caught but guessed the word.`;
      else if (caught.length < imps.length) line = `${u.list(caught)} got caught, but ${u.list(u.arr(R.free))} got away.`;
      else line = `${u.list(caught)} got caught${d.mode === 'classic' ? ' and missed the word' : ''}.`;
      const guesses = R.guesses || {};
      return `<div class="secret"><p class="eyebrow">The imposter${imps.length > 1 ? 's were' : ' was'}</p><p class="secret-word">${imps.map(id => u.esc(u.disp(id))).join(' and ')}</p>
        <p class="muted">The word was <b>${u.esc(d.word)}</b>${d.mode === 'undercover' ? `, and the imposter had <b>${u.esc(d.alt)}</b>` : ''}.</p></div>
        ${Object.keys(guesses).map(id => `<p class="muted center">${u.esc(u.disp(id))} guessed “${u.esc(guesses[id])}”.</p>`).join('')}
        <ul class="bars">${ids.filter(id => counts[id] > 0).map(id => `<li class="${imps.indexOf(id) !== -1 ? 'hot' : ''}"><span class="bn">${u.esc(u.disp(id))}</span><span class="bt"><span class="bf" style="width:${Math.round(counts[id] / Math.max(1, counts[ids[0]]) * 100)}%"></span></span><span class="bc">${counts[id]}</span></li>`).join('')}</ul>
        <p class="outcome">${line}${R.firstVoter ? ` ${u.esc(u.disp(R.firstVoter))} voted for them first.` : ''}</p>`;
    }
  };

  /* ---------------- Guess the Price ---------------- */
  UI.price = {
    intro(u) {
      return {
        what: `You’ll see 3 real products, one at a time, with the store and size. Slide to your guess anywhere from 1¢ to $100, and use the − and + buttons to get it to the cent. The closest guess on each product scores a point, and the furthest guess drinks 1. Most points wins ${prizeName(u.A)}.`,
        part: 'Prices were checked online this October, so think real store prices.'
      };
    },
    prod(u) { return IP.PRODUCTS[u.arr(u.A.d.items)[u.A.i || 0]]; },
    prodCard(u) {
      const p = UI.price.prod(u), i = (u.A.i || 0) + 1;
      return `<div class="prod"><div class="prod-pic">${prodIcon(p.cat)}</div><div class="prod-txt"><p class="eyebrow">Product ${i} of 3 · ${u.esc(p.store)}</p><p class="prod-name">${u.esc(p.name)}</p><p class="muted">${u.esc(p.detail)}</p></div></div>`;
    },
    stages: {
      guess: {
        build(u, el) {
          const start = 1000;
          u.st.v = start;
          el.innerHTML = `${UI.price.prodCard(u)}
            <p class="price-big" id="pBig">${money(start)}</p>
            <label class="sr-only" for="pRange">Your price guess</label>
            <input type="range" class="price-range" id="pRange" min="0" max="1000" step="1" value="${Math.round(IP.tFromPrice(start) * 1000)}">
            <div class="fine"><button type="button" class="btn fbtn" data-d="-100">−$1</button><button type="button" class="btn fbtn" data-d="-1">−1¢</button><button type="button" class="btn fbtn" data-d="1">+1¢</button><button type="button" class="btn fbtn" data-d="100">+$1</button></div>
            <button type="button" class="btn btn-primary btn-block" id="pLock">Lock it in</button>
            <p class="muted small center" id="pStatus"></p>`;
          let deb = 0;
          const push = () => { clearTimeout(deb); deb = setTimeout(() => { if (!u.st.locked) u.input({ v: u.st.v, lock: 0 }); }, 350); };
          const paint = fromRange => {
            el.querySelector('#pBig').textContent = money(u.st.v);
            if (!fromRange) el.querySelector('#pRange').value = String(Math.round(IP.tFromPrice(u.st.v) * 1000));
          };
          u.input({ v: start, lock: 0 });
          el.querySelector('#pRange').addEventListener('input', e => { if (u.st.locked) return; u.st.v = IP.priceFromT(Number(e.target.value) / 1000); paint(true); push(); });
          el.querySelector('.fine').addEventListener('click', e => { const b = e.target.closest('.fbtn'); if (!b || u.st.locked) return; u.st.v = clamp(u.st.v + Number(b.dataset.d), 1, 10000); paint(false); push(); });
          el.querySelector('#pLock').addEventListener('click', () => { if (u.st.locked) return; u.st.locked = true; clearTimeout(deb); u.input({ v: u.st.v, lock: 1 }); UI.price.stages.guess.update(u, el); });
        },
        update(u, el) {
          const mine = u.inputs()[u.me];
          if (mine && mine.lock) {
            u.st.locked = true;
            el.querySelectorAll('.fbtn, #pRange').forEach(x => { x.disabled = true; });
            const l = el.querySelector('#pLock');
            l.disabled = true; l.textContent = `Locked in at ${money(mine.v)}`;
          }
          el.querySelector('#pStatus').textContent = statusLine(u, u.arr(u.A.pl), v => v && v.lock, 'locked in');
        }
      },
      reveal: {
        build(u, el) {
          const rev = u.A.rev || {}, g = rev.g || {}, price = rev.price;
          const ids = Object.keys(g).sort((a, b) => Math.abs(g[a] - price) - Math.abs(g[b] - price));
          const maxV = Math.max(price * 1.6, ...ids.map(id => g[id]), 100);
          const pos = v => clamp(v / maxV * 100, 1, 99);
          const close = u.arr(rev.close), far = u.arr(rev.far);
          el.innerHTML = `${UI.price.prodCard(u)}
            <p class="eyebrow center">Real price</p><p class="price-big real">${money(price)}</p>
            <div class="pline" aria-hidden="true"><span class="pmark real" style="left:${pos(price)}%"></span>${ids.map(id => `<span class="pmark ${close.indexOf(id) !== -1 ? 'close' : ''}" style="left:${pos(g[id])}%" title="${u.esc(u.nameOf(id))}"></span>`).join('')}</div>
            <ol class="res-list">${ids.map((id, i) => `<li class="res-row ${u.isMe(id) ? 'me' : ''} ${close.indexOf(id) !== -1 ? 'win' : ''} ${far.indexOf(id) !== -1 ? 'lose' : ''}"><span class="res-rank">${i + 1}</span><span class="res-name">${u.esc(u.disp(id))}</span><span class="res-score">${money(g[id])}<small>${g[id] === price ? 'exact!' : (g[id] > price ? '+' : '−') + money(Math.abs(g[id] - price))}</small></span></li>`).join('')}</ol>
            <p class="outcome">${close.length ? `${u.list(close)} ${close.length > 1 ? 'were' : 'was'} closest.` : ''}${far.length ? ` ${u.list(far)} ${far.length > 1 ? 'were' : 'was'} furthest and drink${far.length > 1 ? '' : 's'} 1.` : ''}</p>`;
          const p = UI.price.prod(u);
          if (p) el.insertAdjacentHTML('beforeend', `<p class="muted small center">Price: ${u.esc(p.store)}, checked October 2026.</p>`);
        },
        update() {}
      }
    },
    results(u) {
      const R = u.A.res || {}, pts = R.pts || {}, miss = R.miss || {};
      const ids = Object.keys(miss).sort((a, b) => (pts[b] || 0) - (pts[a] || 0) || miss[a] - miss[b]);
      return `<ol class="res-list">${ids.map((id, i) => `<li class="res-row ${u.isMe(id) ? 'me' : ''} ${id === R.winner ? 'win' : ''}"><span class="res-rank">${i + 1}</span><span class="res-name">${u.esc(u.disp(id))}</span><span class="res-score">${plural(pts[id] || 0, 'pt')}<small>off by ${money(miss[id])} total</small></span></li>`).join('')}</ol>
        <p class="outcome">${R.winner ? `${u.esc(u.disp(R.winner))} has the best eye for prices.` : 'No guesses came in.'}</p>`;
    }
  };

  /* ---------------- Cards Against Humanity ---------------- */
  UI.cah = {
    intro(u) {
      const A = u.A, judge = A.d.judge;
      return {
        what: `${u.isMe(judge) ? 'You are' : u.esc(u.nameOf(judge)) + ' is'} the judge and gets the black card. Everyone else gets 7 white cards and has 45 seconds to play the funniest one${A.d.pick === 2 ? ' (this black card takes 2, in order)' : ''}. The judge reads them all out loud and picks a winner, who gets ${prizeName(A)}. One random card from the deck gets played too, and if it wins, nobody gets the prize.`,
        part: u.isMe(judge) ? 'You’re the judge this round. Read every card out loud.' : 'You’ll get 7 white cards. Pick your funniest.',
        html: true
      };
    },
    black(u) { return IP.CAH.black[u.A.d.bi][0]; },
    stages: {
      play: {
        build(u, el) {
          const A = u.A, d = A.d, judge = u.isMe(d.judge);
          u.st.sel = [];
          el.innerHTML = `${blackHTML(u, UI.cah.black(u))}
            ${judge ? `<p class="lede">You’re the judge. Wait for everyone to play.</p>` : `<p class="eyebrow">${d.pick === 2 ? 'Pick 2, in order' : 'Pick 1'}</p>
              <div class="cah-hand" id="cHand">${u.arr(d.hands[u.me]).map(i => `<button type="button" class="cah-white" data-i="${i}"><span class="ord"></span>${u.esc(IP.CAH.white[i])}</button>`).join('')}</div>
              <button type="button" class="btn btn-primary btn-block" id="cPlay" disabled>Play ${d.pick === 2 ? 'these' : 'this card'}</button>`}
            <p class="muted small center" id="cStatus"></p>`;
          if (judge) return;
          const paint = () => {
            el.querySelectorAll('.cah-white').forEach(b => { const k = u.st.sel.indexOf(Number(b.dataset.i)); b.classList.toggle('on', k !== -1); b.querySelector('.ord').textContent = k !== -1 && d.pick === 2 ? String(k + 1) : ''; });
            el.querySelector('#cPlay').disabled = u.st.sel.length !== d.pick || u.st.locked;
          };
          el.querySelector('#cHand').addEventListener('click', e => {
            const b = e.target.closest('.cah-white');
            if (!b || u.st.locked) return;
            const i = Number(b.dataset.i), k = u.st.sel.indexOf(i);
            if (k !== -1) u.st.sel.splice(k, 1);
            else { if (u.st.sel.length >= d.pick) u.st.sel.shift(); u.st.sel.push(i); }
            paint();
          });
          el.querySelector('#cPlay').addEventListener('click', () => { if (u.st.sel.length !== d.pick || u.st.locked) return; u.st.locked = true; u.input({ c: u.st.sel.slice(), lock: 1 }); UI.cah.stages.play.update(u, el); });
        },
        update(u, el) {
          const A = u.A, d = A.d, mine = u.inputs()[u.me];
          if (mine && mine.lock && !u.isMe(d.judge)) {
            u.st.locked = true;
            const c = u.arr(mine.c).map(Number);
            el.querySelectorAll('.cah-white').forEach(b => { b.disabled = true; b.classList.toggle('on', c.indexOf(Number(b.dataset.i)) !== -1); });
            const p = el.querySelector('#cPlay');
            if (p) { p.disabled = true; p.textContent = 'Played'; }
          }
          el.querySelector('#cStatus').textContent = statusLine(u, u.arr(A.pl).filter(id => id !== d.judge), v => v && v.lock, 'played');
        }
      },
      judge: {
        build(u, el) {
          const A = u.A, d = A.d, judge = u.isMe(d.judge), subs = u.arr(A.subs), black = UI.cah.black(u);
          el.innerHTML = `${blackHTML(u, black)}
            <p class="lede">${judge ? 'Read each one out loud, then tap your favorite.' : `${u.esc(u.nameOf(d.judge))} is reading them out…`}</p>
            <div class="cah-subs" id="cSubs">${subs.map((s, i) => `<button type="button" class="cah-sub" data-v="${i}" ${judge ? '' : 'disabled'}><span class="num">${i + 1}</span><span>${fillBlack(u, black, u.arr(s.c).map(x => IP.CAH.white[x]))}</span></button>`).join('')}</div>
            ${judge ? '<button type="button" class="btn btn-primary btn-block" id="cPick" disabled>Pick this one</button>' : ''}`;
          if (!judge) return;
          let sel = null;
          el.querySelector('#cSubs').addEventListener('click', e => { const b = e.target.closest('.cah-sub'); if (!b || u.st.locked) return; sel = Number(b.dataset.v); el.querySelectorAll('.cah-sub').forEach(x => x.classList.toggle('on', x === b)); el.querySelector('#cPick').disabled = false; });
          el.querySelector('#cPick').addEventListener('click', () => { if (sel === null || u.st.locked) return; u.st.locked = true; u.input(sel); el.querySelector('#cPick').disabled = true; el.querySelector('#cPick').textContent = 'Picked'; });
        },
        update() {}
      }
    },
    results(u) {
      const A = u.A, R = A.res || {}, subs = u.arr(A.subs), black = UI.cah.black(u);
      const win = subs[R.choice];
      const owner = s => s.o === 'rando' ? 'Rando (random card)' : u.disp(s.o);
      return `${win ? `<div class="cah-win"><p class="eyebrow">Winning card</p><p class="cah-win-txt">${fillBlack(u, black, u.arr(win.c).map(x => IP.CAH.white[x]))}</p><p class="muted">played by <b>${u.esc(owner(win))}</b></p></div>` : ''}
        <ul class="cah-all">${subs.map((s, i) => i === R.choice ? '' : `<li><span>${fillBlack(u, black, u.arr(s.c).map(x => IP.CAH.white[x]))}</span><small>${u.esc(owner(s))}</small></li>`).join('')}</ul>
        <p class="outcome">${R.rando ? 'Rando won, so nobody gets the prize.' : ''}</p>
        <p class="credit">${u.esc(IP.CAH.credit)}</p>`;
    }
  };

  IP.ACT_UI = UI;
  IP.fillBlack = fillBlack;
})(window.IP = window.IP || {});
