// Mini-game rules shared by the host engine and the phone screens: names, timing,
// seeded layouts (so every phone gets the same cup spots, ghosts and cards) and bot scores.
// Scores are always finite numbers so they can be stored in Firebase.
(function (IP) {
  'use strict';
  const SUITS = ['h', 'd', 'c', 's'];

  IP.mulberry32 = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  function shuffle(a, r) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function gauss(r) { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  IP.EARLY = 99999; // Quick Draw score when every try was too early

  IP.MINI_META = {
    cup: {
      id: 'cup', name: 'Cup Shot', tag: 'Aim', live: true, higher: true, dur: 30000, unit: '',
      how: 'Swipe up from the ball to throw. Faster swipes go farther, and the angle steers it. The cup jumps to a new spot after every make. Most cups in 30 seconds wins.',
      fmt: r => `${r.score} cup${r.score === 1 ? '' : 's'}`,
      setup(rng) {
        const spots = [];
        let prev = { d: 0.6, l: 0 };
        for (let i = 0; i < 60; i++) {
          let s, tries = 0;
          do { s = { d: 0.28 + rng() * 0.56, l: -0.7 + rng() * 1.4 }; tries++; } while (tries < 20 && Math.abs(s.d - prev.d) < 0.18 && Math.abs(s.l - prev.l) < 0.4);
          spots.push(s); prev = s;
        }
        return { spots };
      },
      bot(skill, rng) {
        const p = 0.13 + skill * 0.2, throws = 18 + Math.floor(rng() * 6);
        let score = 0, last = 0;
        for (let i = 0; i < throws; i++) { const t = (i + 1) * (29.5 / throws); if (rng() < p) { score++; last = t; } }
        return { score, tb: Math.round(last * 100) / 100 };
      }
    },
    quick: {
      id: 'quick', name: 'Quick Draw', tag: 'Reflex', live: false, higher: false, dur: 0, cap: 25000,
      how: 'Wait for the pad to flash orange, then tap it as fast as you can. Tap too early and that try doesn’t count. You get 3 tries, and your fastest one is your score.',
      fmt: r => r.score >= IP.EARLY ? 'Jumped the gun' : `${Math.round(r.score)} ms`,
      setup(rng) { return { delays: [0, 1, 2].map(() => 1300 + Math.round(rng() * 2700)) }; },
      bot(skill, rng) {
        let best = IP.EARLY;
        for (let i = 0; i < 3; i++) { if (rng() < 0.08) continue; best = Math.min(best, Math.max(150, Math.round(235 + (1 - skill) * 110 + gauss(rng) * 35))); }
        return { score: best, tb: 0 };
      }
    },
    clock: {
      id: 'clock', name: 'Stop the Clock', tag: 'Timing', live: false, higher: false, dur: 0, cap: 26000,
      how: 'A timer starts counting up. Stop it at exactly 10.00 seconds. The numbers vanish after 3 seconds, so you have to feel it. Closest wins.',
      fmt: r => `${(r.extra || 0).toFixed(2)} s`,
      sub: r => `${(r.score || 0).toFixed(2)} off`,
      bot(skill, rng) { const err = gauss(rng) * (0.22 + (1 - skill) * 0.6); return { score: Math.round(Math.abs(err) * 1000) / 1000, tb: 0, extra: Math.round((10 + err) * 1000) / 1000 }; }
    },
    ghost: {
      id: 'ghost', name: 'Ghost Whack', tag: 'Speed', live: true, higher: true, dur: 20000, unit: '',
      how: 'Ghosts pop out of the graves. Tap one for a point. Pumpkins pop up too, and tapping a pumpkin costs you a point. Most points in 20 seconds wins.',
      fmt: r => `${r.score} pt${Math.abs(r.score) === 1 ? '' : 's'}`,
      setup(rng) {
        const ev = [], busyUntil = new Array(9).fill(0);
        let t = 500;
        while (t < 19300) {
          const free = [0, 1, 2, 3, 4, 5, 6, 7, 8].filter(i => busyUntil[i] < t);
          if (free.length) {
            const hole = free[Math.floor(rng() * free.length)], pumpkin = rng() < 0.2, life = 950 - (t / 20000) * 300 + rng() * 150;
            ev.push({ t, hole, pumpkin, life });
            busyUntil[hole] = t + life + 120;
          }
          t += 330 + rng() * 380 - (t / 20000) * 120;
        }
        return { ev, ghosts: ev.filter(e => !e.pumpkin).length };
      },
      bot(skill, rng, data) {
        const hits = Math.round(data.ghosts * (0.42 + 0.42 * skill + (rng() - 0.5) * 0.12));
        const oops = rng() < 0.5 ? 0 : (rng() < 0.7 ? 1 : 2);
        return { score: hits - oops, tb: 0 };
      }
    },
    cauldron: {
      id: 'cauldron', name: 'Shake the Cauldron', tag: 'Chaos', live: true, higher: true, dur: 10000, unit: '%',
      how: 'Shake your phone to fill the potion. Whoever’s fullest after 10 seconds wins. Hold on to your drink.',
      fmt: r => `${r.score}% full`,
      bot(skill, rng) { return { score: Math.round(50 + skill * 45 + (rng() - 0.5) * 24), tb: 0 }; }
    },
    simon: {
      id: 'simon', name: 'Simon Spooks', tag: 'Memory', live: false, higher: true, dur: 0, cap: 120000,
      how: 'Watch the suits light up, then tap them back in the same order. Every round adds one more. Longest streak wins.',
      fmt: r => `Streak of ${r.score}`,
      setup(rng) { return { seq: Array.from({ length: 20 }, () => SUITS[Math.floor(rng() * 4)]) }; },
      bot(skill, rng) { return { score: Math.max(0, 3 + Math.floor(skill * 5) + Math.floor(rng() * 3) - (rng() < 0.2 ? 1 : 0)), tb: 0 }; }
    },
    bus: {
      id: 'bus', name: 'Speed Bus', tag: 'Cards', live: true, higher: true, dur: 30000, unit: '',
      how: 'A card is showing. Guess if the next one is higher or lower, as fast as you can. The same rank is a push. Most right in 30 seconds wins.',
      fmt: r => `${r.score} right`,
      setup(rng) {
        const deck = [];
        for (let k = 0; k < 3; k++) { const d = []; for (const s of SUITS) for (let r = 1; r <= 13; r++) d.push({ r, s }); shuffle(d, rng); deck.push.apply(deck, d); }
        return { deck };
      },
      bot(skill, rng) {
        const n = Math.floor(19 + skill * 10 + rng() * 4), acc = 0.6 + 0.14 * skill;
        let sc = 0; for (let i = 0; i < n; i++) if (rng() < acc) sc++;
        return { score: sc, tb: 0 };
      }
    }
  };
  IP.MINI_ORDER = ['cup', 'quick', 'clock', 'ghost', 'cauldron', 'simon', 'bus'];

  // Ranking: better score first, then lower tie-break (earlier last cup).
  IP.miniCompare = function (meta, a, b) {
    if (a.score !== b.score) return meta.higher ? (b.score > a.score ? 1 : -1) : (a.score > b.score ? 1 : -1);
    return (a.tb || 0) - (b.tb || 0);
  };
})(window.IP = window.IP || {});
