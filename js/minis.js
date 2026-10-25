// The seven mini games as they play on each phone. Each run() draws into `stage`,
// reports progress through ctx.setScore / ctx.setTimerText, and resolves with the final score.
(function (IP) {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const vibrate = ms => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* not supported */ } };
  const SUITS = ['h', 'd', 'c', 's'];
  const SUIT_CH = { h: '♥︎', d: '♦︎', c: '♣︎', s: '♠︎' };
  const SUIT_NAME = { h: 'Hearts', d: 'Diamonds', c: 'Clubs', s: 'Spades' };
  const isRed = s => s === 'h' || s === 'd';
  const rankLabel = r => ({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' })[r] || String(r);
  const cardText = c => rankLabel(c.r) + SUIT_CH[c.s];
  const UP = '<svg class="ico line" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
  const DOWN = '<svg class="ico line" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>';

  const GHOST_SVG = '<svg viewBox="0 0 60 70" aria-hidden="true"><path d="M6 66V30a24 24 0 0 1 48 0v36l-8-7-8 7-8-7-8 7-8-7z" style="fill:var(--bone)"/><ellipse cx="22" cy="30" rx="4.5" ry="6" style="fill:var(--ground)"/><ellipse cx="38" cy="30" rx="4.5" ry="6" style="fill:var(--ground)"/><ellipse cx="30" cy="45" rx="5" ry="3.5" style="fill:var(--ground)"/></svg>';
  const PUMPKIN_SVG = '<svg viewBox="0 0 60 60" aria-hidden="true"><path d="M30 14c-1-6 2-10 7-10" style="fill:none;stroke:var(--felt-ink);stroke-width:3.5;stroke-linecap:round"/><ellipse cx="30" cy="36" rx="26" ry="21" style="fill:var(--accent)"/><path d="M30 15c-7 7-7 35 0 42M30 15c7 7 7 35 0 42" style="fill:none;stroke:var(--rust);stroke-width:2"/><path d="M16 32l6-7 6 7zM32 32l6-7 6 7z" style="fill:var(--accent-ink)"/><path d="M17 42q13 9 26 0q-13 4-26 0z" style="fill:var(--accent-ink)"/></svg>';
  const CAULDRON_SVG = '<svg viewBox="0 0 200 186" aria-hidden="true"><defs><clipPath id="caClip"><path d="M30 64Q30 166 100 166Q170 166 170 64Z"/></clipPath></defs><path d="M52 150l-12 30M148 150l12 30" style="stroke:var(--line-2);stroke-width:9;stroke-linecap:round"/><path d="M30 64Q30 166 100 166Q170 166 170 64Z" style="fill:var(--plum)"/><g clip-path="url(#caClip)"><rect id="caLiquid" x="20" y="166" width="160" height="130" style="fill:var(--potion)"/></g><path d="M22 56H178a7 7 0 0 1 0 14H22a7 7 0 0 1 0-14z" style="fill:var(--line-2)"/></svg>';

  const UI = {};

  /* Cup Shot ---------------------------------------------------------------- */
  UI.cup = {
    run(stage, ctx, data) {
      return new Promise(resolve => {
        stage.innerHTML = '<canvas class="cup-canvas" id="cupCv" role="img" aria-label="Cup Shot table. Swipe up from the ball toward the cup to throw."></canvas><p class="hint-line" id="cupHint" aria-live="polite">Swipe up from the ball</p>';
        const cv = $('#cupCv'), hint = $('#cupHint');
        const css = getComputedStyle(document.documentElement);
        const col = k => css.getPropertyValue(k).trim();
        const C = { ground: col('--surface-2'), felt: col('--felt'), line: col('--felt-line'), edge: col('--felt-ink'), bone: col('--bone'), accent: col('--accent'), ink: col('--accent-ink'), drop: col('--drop') };
        const displayFont = css.getPropertyValue('--font-display');
        const g = cv.getContext('2d');
        const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
        let W = 300, H = 360;
        const size = () => { const r = cv.getBoundingClientRect(); W = r.width || 300; H = r.height || 360; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); };
        size();
        window.addEventListener('resize', size);
        const nearY = () => H * 0.93, farY = () => H * 0.13;
        const yAt = d => nearY() + (farY() - nearY()) * d;
        const hwAt = d => W * 0.5 + (W * 0.27 - W * 0.5) * d;
        const sAt = d => 1 - 0.55 * d;
        const xAt = (d, l) => W / 2 + l * hwAt(d);
        const BALL_D = 0.03;
        let spot = 0, cup = Object.assign({}, data.spots[0], { born: performance.now() });
        let score = 0, lastHit = 0, fly = null, fade = null, splash = null, busy = false, over = false, raf = 0, hintTimer = 0;
        const t0 = performance.now();
        const say = (txt, good) => {
          hint.textContent = txt; hint.classList.toggle('good', !!good);
          clearTimeout(hintTimer);
          hintTimer = setTimeout(() => { if (!over) { hint.textContent = 'Swipe up from the ball'; hint.classList.remove('good'); } }, 1100);
        };
        const rim = d => { const s = sAt(d); const rx = 34 * s; return { rx, ry: rx * 0.34, bh: 62 * s }; };
        const hitTest = (dl, ll) => {
          const m = rim(cup.d);
          const dx = (ll - cup.l) * hwAt(cup.d), dy = yAt(dl) - yAt(cup.d);
          return (dx / m.rx) ** 2 + (dy / (m.ry * 3.4)) ** 2 <= 1;
        };
        const ell = (x, y, rx, ry) => { g.beginPath(); g.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, Math.PI * 2); g.fill(); };
        const drawCup = now => {
          const age = clamp((now - cup.born) / 260, 0, 1);
          const k = sAt(cup.d) * (0.55 + 0.45 * (1 - Math.pow(1 - age, 3)));
          const x = xAt(cup.d, cup.l), yb = yAt(cup.d);
          const rx = 34 * k, ry = rx * 0.34, bh = 62 * k, bx = rx * 0.74, yr = yb - bh;
          g.fillStyle = C.drop; ell(x, yb + 2 * k, rx * 0.95, ry * 0.8);
          g.fillStyle = C.accent;
          g.beginPath(); g.moveTo(x - rx, yr); g.lineTo(x + rx, yr); g.lineTo(x + bx, yb); g.quadraticCurveTo(x, yb + ry * 0.7, x - bx, yb); g.closePath(); g.fill();
          g.fillStyle = C.ink;
          const ey = yr + bh * 0.36, es = rx * 0.2;
          [-1, 1].forEach(sgn => { const ex = x + sgn * rx * 0.34; g.beginPath(); g.moveTo(ex - es, ey + es * 0.6); g.lineTo(ex + es, ey + es * 0.6); g.lineTo(ex, ey - es * 0.8); g.closePath(); g.fill(); });
          g.beginPath(); g.moveTo(x - rx * 0.45, yr + bh * 0.6); g.quadraticCurveTo(x, yr + bh * 0.82, x + rx * 0.45, yr + bh * 0.6); g.quadraticCurveTo(x, yr + bh * 0.7, x - rx * 0.45, yr + bh * 0.6); g.fill();
          g.fillStyle = C.bone; ell(x, yr, rx, ry);
          g.fillStyle = C.ink; ell(x, yr + ry * 0.08, rx * 0.8, ry * 0.7);
        };
        const drawBall = (d, l, h, alpha) => {
          const s = sAt(d), x = xAt(d, l), yg = yAt(d);
          g.globalAlpha = alpha * 0.45; g.fillStyle = C.drop; ell(x, yg + 2, 14 * s, 4 * s);
          g.globalAlpha = alpha; g.fillStyle = C.bone;
          g.beginPath(); g.arc(x, yg - h - 13 * s, 14 * s, 0, Math.PI * 2); g.fill();
          g.globalAlpha = 1;
        };
        const draw = now => {
          g.setTransform(dpr, 0, 0, dpr, 0, 0);
          g.fillStyle = C.ground; g.fillRect(0, 0, W, H);
          g.fillStyle = C.felt;
          g.beginPath(); g.moveTo(xAt(1, -1), farY()); g.lineTo(xAt(1, 1), farY()); g.lineTo(W * 1.04, H); g.lineTo(-W * 0.04, H); g.closePath(); g.fill();
          g.strokeStyle = C.line; g.lineWidth = 1.5;
          [-0.5, 0, 0.5].forEach(l => { g.beginPath(); g.moveTo(xAt(1, l), farY()); g.lineTo(xAt(-0.1, l), H); g.stroke(); });
          g.strokeStyle = C.edge; g.globalAlpha = 0.5; g.lineWidth = 3; g.beginPath(); g.moveTo(xAt(1, -1), farY()); g.lineTo(xAt(1, 1), farY()); g.stroke(); g.globalAlpha = 1;
          let ball = null;
          if (fly) {
            const t = clamp((now - fly.t0) / fly.dur, 0, 1);
            const d = BALL_D + (fly.dl - BALL_D) * t, l = fly.ll * t;
            ball = { d, l, h: Math.sin(Math.PI * t) * fly.arc * sAt(d) + t * fly.endH, a: 1 };
          } else if (fade) {
            const t = clamp((now - fade.t0) / 320, 0, 1);
            ball = { d: fade.d, l: fade.l, h: 0, a: 1 - t };
            if (t >= 1) fade = null;
          }
          const behind = ball && ball.d > cup.d + 0.01;
          if (ball && behind) drawBall(ball.d, ball.l, ball.h, ball.a);
          drawCup(now);
          if (ball && !behind) drawBall(ball.d, ball.l, ball.h, ball.a);
          if (!fly && !over) drawBall(BALL_D, 0, 0, 1);
          if (splash) {
            const t = clamp((now - splash.t0) / 380, 0, 1);
            g.strokeStyle = C.accent; g.globalAlpha = 1 - t; g.lineWidth = 3;
            g.beginPath(); g.ellipse(splash.x, splash.y, splash.rx * (1 + t * 1.3), splash.ry * (1 + t * 1.3), 0, 0, Math.PI * 2); g.stroke();
            g.fillStyle = C.accent; g.font = `${Math.round(20 + 6 * (1 - t))}px ${displayFont}`; g.textAlign = 'center';
            g.fillText('+1', splash.x, splash.y - 20 - t * 26);
            g.globalAlpha = 1;
            if (t >= 1) splash = null;
          }
        };
        const land = now => {
          const f = fly; fly = null;
          if (f.hit) {
            score++; lastHit = (now - t0) / 1000; ctx.setScore(score); vibrate(25);
            const m = rim(cup.d);
            splash = { t0: now, x: xAt(cup.d, cup.l), y: yAt(cup.d) - m.bh, rx: m.rx, ry: m.ry };
            say('Sunk it!', true);
            setTimeout(() => { spot++; cup = Object.assign({}, data.spots[spot % data.spots.length], { born: performance.now() }); busy = false; }, 300);
          } else {
            fade = { d: f.dl, l: f.ll, t0: now };
            if (!f.onTable) say(f.dl > 1 ? 'Off the back of the table' : (f.dl < 0 ? 'Too short' : 'Off the side'));
            else {
              const m = rim(cup.d);
              const dx = (f.ll - cup.l) * hwAt(cup.d) / m.rx, dy = (yAt(f.dl) - yAt(cup.d)) / (m.ry * 3.4);
              if (Math.abs(dy) >= Math.abs(dx)) say(dy > 0 ? 'Too short' : 'Too long');
              else say(dx < 0 ? 'A bit left' : 'A bit right');
            }
            setTimeout(() => { busy = false; }, 150);
          }
        };
        const finish = () => {
          over = true;
          cancelAnimationFrame(raf);
          draw(performance.now());
          window.removeEventListener('resize', size);
          clearTimeout(hintTimer);
          hint.textContent = 'Time!'; hint.classList.remove('good');
          setTimeout(() => resolve({ score, tb: Math.round(lastHit * 100) / 100 }), 600);
        };
        const loop = now => {
          if (fly && now - fly.t0 >= fly.dur) land(now);
          draw(now);
          if (!over && now - t0 >= 30000 && !fly) return finish();
          raf = requestAnimationFrame(loop);
        };
        let samples = [], tracking = false, startY = 0;
        const pt = e => ({ x: e.clientX, y: e.clientY, t: performance.now() });
        cv.addEventListener('pointerdown', e => {
          if (over || busy) return;
          e.preventDefault();
          tracking = true;
          try { cv.setPointerCapture(e.pointerId); } catch (err) { /* optional */ }
          samples = [pt(e)]; startY = e.clientY;
        });
        cv.addEventListener('pointermove', e => { if (!tracking) return; samples.push(pt(e)); if (samples.length > 40) samples.shift(); });
        cv.addEventListener('pointerup', e => {
          if (!tracking) return;
          tracking = false;
          samples.push(pt(e));
          const last = samples[samples.length - 1];
          let first = samples[0];
          for (let i = samples.length - 1; i >= 0; i--) { if (last.t - samples[i].t <= 90) first = samples[i]; else break; }
          const dt = Math.max(8, last.t - first.t);
          const vy = (first.y - last.y) / dt, vx = (last.x - first.x) / dt;
          if (vy < 0.25 || startY - last.y < 24) { say('Swipe up faster to throw'); return; }
          const dl = clamp((vy - 0.3) / 1.65, -0.15, 1.3);
          const ll = clamp((vx / vy) * 1.75, -1.7, 1.7);
          const onTable = dl >= 0 && dl <= 1.02 && Math.abs(ll) <= 1.05;
          const hit = onTable && hitTest(dl, ll);
          busy = true;
          fly = { t0: performance.now(), dur: 470 + clamp(dl, 0, 1.2) * 260, dl, ll, hit, onTable, arc: H * 0.3 + clamp(dl, 0, 1.2) * H * 0.12, endH: hit ? rim(cup.d).bh : 0 };
        });
        cv.addEventListener('pointercancel', () => { tracking = false; });
        ctx.start(30000);
        raf = requestAnimationFrame(loop);
      });
    }
  };

  /* Quick Draw -------------------------------------------------------------- */
  UI.quick = {
    run(stage, ctx, data) {
      return new Promise(resolve => {
        stage.innerHTML = '<button type="button" class="qd-pad" id="qdPad"><span class="big" id="qdBig">Get ready</span><span id="qdSub">Try 1 of 3</span></button><div class="qd-tries" id="qdTries"></div>';
        const pad = $('#qdPad'), big = $('#qdBig'), sub = $('#qdSub'), triesEl = $('#qdTries');
        let attempt = 0, state = 'idle', goAt = 0, timer = 0, best = IP.EARLY;
        const tries = [];
        const renderTries = () => { triesEl.innerHTML = [0, 1, 2].map(i => { const v = tries[i]; return `<span class="try ${v === undefined ? '' : 'done'}">${v === undefined ? '–' : (v === null ? 'Early' : Math.round(v) + ' ms')}</span>`; }).join(''); };
        const record = (ms, label) => {
          clearTimeout(timer);
          state = 'show'; tries.push(ms); best = Math.min(best, Math.round(ms));
          pad.className = 'qd-pad'; big.textContent = label || `${Math.round(ms)} ms`; sub.textContent = attempt < 3 ? 'Next try coming…' : 'That’s all 3';
          renderTries(); setTimeout(next, 1300);
        };
        const next = () => {
          if (attempt >= 3) { ctx.setTimerText('Done'); setTimeout(() => resolve({ score: best, tb: 0 }), 400); return; }
          attempt++;
          state = 'wait'; pad.className = 'qd-pad'; big.textContent = 'Wait for it…'; sub.textContent = `Try ${attempt} of 3`;
          ctx.setTimerText(`Try ${attempt} of 3`);
          timer = setTimeout(() => {
            state = 'go'; pad.className = 'qd-pad go'; big.textContent = 'TAP!'; sub.textContent = 'Now!';
            goAt = performance.now();
            requestAnimationFrame(() => { goAt = performance.now(); });
            timer = setTimeout(() => { if (state === 'go') record(1000, 'Too slow'); }, 1500);
          }, (data && data.delays && data.delays[attempt - 1]) || 2000);
        };
        const hit = () => {
          if (state === 'wait') {
            clearTimeout(timer); state = 'show'; tries.push(null);
            pad.className = 'qd-pad early'; big.textContent = 'Too early!'; sub.textContent = 'That try doesn’t count';
            vibrate(60); renderTries(); setTimeout(next, 1300);
          } else if (state === 'go') record(performance.now() - goAt);
        };
        pad.addEventListener('pointerdown', e => { e.preventDefault(); hit(); });
        pad.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); hit(); } });
        renderTries();
        setTimeout(next, 500);
      });
    }
  };

  /* Stop the Clock ------------------------------------------------------------ */
  UI.clock = {
    run(stage, ctx) {
      return new Promise(resolve => {
        stage.innerHTML = '<div class="sc"><p class="sc-target">Target <b>10.00</b></p><p class="sc-digits" id="scD">0.00</p><p class="muted center" id="scNote" aria-live="polite">Watch the first 3 seconds…</p><button type="button" class="sc-stop" id="scBtn">Stop</button></div>';
        const d = $('#scD'), note = $('#scNote'), btn = $('#scBtn');
        const t0 = performance.now();
        let raf = 0, stopped = false;
        ctx.setTimerText('Aim for 10.00');
        const stop = () => {
          if (stopped) return;
          stopped = true; cancelAnimationFrame(raf);
          const el = Math.min(20, (performance.now() - t0) / 1000);
          d.classList.remove('hide'); d.textContent = el.toFixed(2);
          const off = Math.abs(el - 10);
          note.textContent = off < 0.05 ? 'Basically perfect.' : `${off.toFixed(2)} seconds ${el < 10 ? 'early' : 'late'}`;
          btn.disabled = true;
          setTimeout(() => resolve({ score: Math.round(off * 1000) / 1000, tb: 0, extra: Math.round(el * 1000) / 1000 }), 1500);
        };
        const loop = () => {
          const el = (performance.now() - t0) / 1000;
          if (el < 3) d.textContent = el.toFixed(2);
          else if (!d.classList.contains('hide')) { d.textContent = '?.??'; d.classList.add('hide'); note.textContent = 'Count it in your head…'; }
          if (el >= 20) return stop();
          raf = requestAnimationFrame(loop);
        };
        btn.addEventListener('pointerdown', e => { e.preventDefault(); stop(); });
        btn.addEventListener('click', stop);
        raf = requestAnimationFrame(loop);
      });
    }
  };

  /* Ghost Whack --------------------------------------------------------------- */
  UI.ghost = {
    run(stage, ctx, data) {
      return new Promise(resolve => {
        stage.innerHTML = `<div class="graves" id="gw">${[0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => `<button type="button" class="grave" data-i="${i}" aria-label="Grave ${i + 1}"><span class="sprite ghost">${GHOST_SVG}</span><span class="sprite pumpkin">${PUMPKIN_SVG}</span><span class="pop" aria-hidden="true"></span></button>`).join('')}</div><p class="hint-line" id="gwHint">Tap the ghosts. Leave the pumpkins.</p>`;
        const graves = $$('.grave', stage), up = new Array(9).fill(null), until = new Array(9).fill(0);
        let score = 0, idx = 0, raf = 0, over = false;
        const t0 = performance.now();
        const hide = i => { graves[i].classList.remove('is-ghost', 'is-pumpkin'); graves[i].setAttribute('aria-label', `Grave ${i + 1}`); up[i] = null; };
        const popText = (b, txt, cls) => { const p = b.querySelector('.pop'); p.textContent = txt; p.className = 'pop ' + cls; void p.offsetWidth; p.classList.add('show'); };
        const whack = i => {
          if (over || !up[i]) return;
          const b = graves[i];
          if (up[i] === 'ghost') { score++; popText(b, '+1', 'plus'); } else { score--; popText(b, '−1', 'minus'); vibrate(40); }
          hide(i); ctx.setScore(score);
        };
        const finish = () => { over = true; cancelAnimationFrame(raf); for (let i = 0; i < 9; i++) hide(i); $('#gwHint').textContent = 'Time!'; setTimeout(() => resolve({ score, tb: 0 }), 600); };
        const loop = now => {
          const el = now - t0;
          while (idx < data.ev.length && data.ev[idx].t <= el) {
            const e = data.ev[idx++];
            if (!up[e.hole]) {
              up[e.hole] = e.pumpkin ? 'pumpkin' : 'ghost';
              until[e.hole] = now + e.life;
              graves[e.hole].classList.add(e.pumpkin ? 'is-pumpkin' : 'is-ghost');
              graves[e.hole].setAttribute('aria-label', `Grave ${e.hole + 1}: ${e.pumpkin ? 'pumpkin' : 'ghost'}`);
            }
          }
          for (let i = 0; i < 9; i++) if (up[i] && now > until[i]) hide(i);
          if (el >= 20000) return finish();
          raf = requestAnimationFrame(loop);
        };
        $('#gw').addEventListener('pointerdown', e => { const b = e.target.closest('.grave'); if (!b) return; e.preventDefault(); whack(+b.dataset.i); });
        $('#gw').addEventListener('click', e => { if (e.detail !== 0) return; const b = e.target.closest('.grave'); if (b) whack(+b.dataset.i); });
        ctx.start(20000);
        raf = requestAnimationFrame(loop);
      });
    }
  };

  /* Shake the Cauldron -------------------------------------------------------- */
  UI.cauldron = {
    // Must be called from a tap (iPhones only ask for motion access inside a tap).
    prepare() {
      const st = { got: false, handler: null, onMotion: null };
      const listen = () => {
        st.handler = e => {
          const a = e.accelerationIncludingGravity || e.acceleration;
          if (a && (a.x !== null || a.y !== null)) st.got = true;
          if (st.onMotion) st.onMotion(e);
        };
        window.addEventListener('devicemotion', st.handler);
      };
      try {
        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
          return DeviceMotionEvent.requestPermission().then(r => { if (r === 'granted') listen(); return st; }).catch(() => st);
        }
        if (typeof DeviceMotionEvent !== 'undefined') listen();
      } catch (e) { /* motion not available */ }
      return Promise.resolve(st);
    },
    run(stage, ctx, data, st) {
      return new Promise(resolve => {
        const mode = st && st.got ? 'shake' : 'tap';
        if (mode === 'tap' && st && st.handler) { window.removeEventListener('devicemotion', st.handler); st.handler = null; }
        const TARGET = mode === 'shake' ? 40 : 70;
        stage.innerHTML = `<p class="mode-note">${mode === 'shake' ? 'Shake your phone!' : 'Tap the cauldron as fast as you can!'}</p>${mode === 'tap' ? '<p class="muted small center">This phone isn’t sharing its motion sensor, so you’re in tap mode.</p>' : ''}<button type="button" class="cauldron-btn" id="caBtn" aria-label="Cauldron">${CAULDRON_SVG}</button><p class="pct" id="caPct">0%</p>`;
        const liquid = $('#caLiquid'), pctEl = $('#caPct'), btn = $('#caBtn');
        let count = 0, last = 0, prev = null, over = false;
        const bump = () => {
          if (over) return;
          count++;
          const pct = Math.round(count / TARGET * 100);
          pctEl.textContent = (pct > 100 ? 'Overflowing! ' : '') + pct + '%';
          liquid.setAttribute('y', String(166 - Math.min(1, count / TARGET) * 104));
          ctx.setScore(pct);
          btn.classList.remove('bub'); void btn.offsetWidth; btn.classList.add('bub');
        };
        if (mode === 'shake') {
          st.onMotion = e => {
            const a = e.accelerationIncludingGravity || e.acceleration;
            if (!a) return;
            const cur = { x: a.x || 0, y: a.y || 0, z: a.z || 0 };
            if (prev) {
              const dd = Math.hypot(cur.x - prev.x, cur.y - prev.y, cur.z - prev.z), now = performance.now();
              if (dd > 13 && now - last > 110) { last = now; bump(); }
            }
            prev = cur;
          };
        } else {
          btn.addEventListener('pointerdown', e => { e.preventDefault(); bump(); });
          btn.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); bump(); } });
        }
        ctx.start(10000);
        setTimeout(() => {
          over = true;
          if (st && st.handler) window.removeEventListener('devicemotion', st.handler);
          pctEl.textContent = 'Time! ' + pctEl.textContent;
          setTimeout(() => resolve({ score: Math.round(count / TARGET * 100), tb: 0 }), 600);
        }, 10000);
      });
    }
  };

  /* Simon Spooks -------------------------------------------------------------- */
  UI.simon = {
    run(stage, ctx, data) {
      return new Promise(resolve => {
        stage.innerHTML = `<p class="si-status" id="siStatus" aria-live="polite">Watch…</p><div class="simon" id="siGrid">${SUITS.map(s => `<button type="button" class="sbtn s-${s}" data-s="${s}" aria-label="${SUIT_NAME[s]}" disabled>${SUIT_CH[s]}</button>`).join('')}</div>`;
        const st = $('#siStatus'), btns = {};
        $$('.sbtn', stage).forEach(b => { btns[b.dataset.s] = b; });
        let L = 3, score = 0, pos = 0, accepting = false, done = false;
        ctx.setTimerText('Streak 0');
        const setEnabled = on => { Object.keys(btns).forEach(k => { btns[k].disabled = !on; }); };
        const flash = async (s, ms) => { btns[s].classList.add('lit'); await wait(ms); btns[s].classList.remove('lit'); };
        const play = async () => {
          accepting = false; setEnabled(false);
          st.textContent = `Watch… ${L} suits`;
          await wait(650);
          const on = L > 6 ? 330 : 430, off = L > 6 ? 110 : 160;
          for (let i = 0; i < L; i++) { await flash(data.seq[i], on); await wait(off); }
          st.textContent = 'Your turn'; pos = 0; accepting = true; setEnabled(true);
        };
        const finish = () => { done = true; setEnabled(false); setTimeout(() => resolve({ score, tb: 0 }), 1300); };
        $('#siGrid').addEventListener('click', async e => {
          const b = e.target.closest('.sbtn');
          if (!b || !accepting || done) return;
          const s = b.dataset.s;
          flash(s, 150);
          if (s === data.seq[pos]) {
            pos++;
            if (pos === L) {
              accepting = false; score = L; ctx.setScore(score); ctx.setTimerText(`Streak ${score}`); st.textContent = 'Nice!';
              if (L >= data.seq.length) return finish();
              L++; await wait(450); play();
            }
          } else {
            accepting = false; b.classList.add('wrong');
            st.textContent = `Wrong suit. It was ${SUIT_NAME[data.seq[pos]]}.`;
            finish();
          }
        });
        play();
      });
    }
  };

  /* Speed Bus ----------------------------------------------------------------- */
  UI.bus = {
    run(stage, ctx, data) {
      return new Promise(resolve => {
        stage.innerHTML = `<div class="sb"><div class="sb-cards"><div class="bigcard" id="sbCur" role="img"></div><div class="bigcard back" aria-hidden="true"></div></div><p class="sb-msg" id="sbMsg" aria-live="polite">Higher or lower?</p><div class="guess"><button type="button" class="btn gbtn btn-primary" id="sbHi">${UP}<span>Higher</span></button><button type="button" class="btn gbtn btn-bone" id="sbLo">${DOWN}<span>Lower</span></button></div></div>`;
        let i = 0, score = 0, over = false, lock = false;
        const cur = $('#sbCur'), msg = $('#sbMsg');
        const draw = () => {
          const c = data.deck[i];
          cur.className = `bigcard ${isRed(c.s) ? 'red' : ''}`;
          cur.setAttribute('aria-label', `Current card ${cardText(c)}`);
          cur.innerHTML = `<span class="rk">${rankLabel(c.r)}</span><span class="big">${SUIT_CH[c.s]}</span><span class="sm">${SUIT_CH[c.s]}</span>`;
        };
        const guess = hi => {
          if (over || lock) return;
          const a = data.deck[i], b = data.deck[i + 1];
          i++;
          const res = b.r === a.r ? 'push' : (((b.r > a.r) === hi) ? 'yes' : 'no');
          if (res === 'yes') { score++; ctx.setScore(score); }
          msg.textContent = res === 'yes' ? `Yes! ${cardText(b)}` : (res === 'no' ? `Nope, ${cardText(b)}` : `Push. Another ${rankLabel(b.r)}`);
          msg.className = 'sb-msg ' + res;
          draw(); void cur.offsetWidth; cur.classList.add('pop');
          lock = true; setTimeout(() => { lock = false; }, 120);
          if (i >= data.deck.length - 2) i = 0;
        };
        draw();
        $('#sbHi').addEventListener('click', () => guess(true));
        $('#sbLo').addEventListener('click', () => guess(false));
        ctx.start(30000);
        setTimeout(() => {
          over = true; msg.textContent = 'Time!'; msg.className = 'sb-msg';
          $('#sbHi').disabled = true; $('#sbLo').disabled = true;
          setTimeout(() => resolve({ score, tb: 0 }), 700);
        }, 30000);
      });
    }
  };

  IP.MINI_UI = UI;
})(window.IP = window.IP || {});
