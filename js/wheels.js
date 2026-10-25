// Default punishment wheels: one per round, eight slices each, getting wilder as the rounds go.
// Slice types:
//   drinks  n drinks. Right: hand them out. Wrong: take them.
//   all     everyone drinks n times.
//   pick    right: pick someone to do `done`. Wrong: you do `take`. Optional w = drinks it counts as.
//   say     right: `give`. Wrong: `take`. No target.
//   group   a group game (`text`) either way.
//   none    free pass.
//   shield  right: bonus Shield. Wrong: nothing happens.
(function (IP) {
  'use strict';
  const W = (label, type, extra) => Object.assign({ label, type }, extra || {});

  IP.DEFAULT_WHEELS = [
    { name: 'Warm-up', slices: [
      W('2 DRINKS', 'drinks', { n: 2 }),
      W('ACCENT', 'pick', { give: 'Pick someone to talk in an accent until their next turn', done: 'talk in an accent until your next turn', take: 'Talk in an accent until your next turn' }),
      W('CATEGORY', 'group', { text: 'Start a category. First person to blank drinks.' }),
      W('SOCIAL', 'all', { n: 1 }),
      W('3 DRINKS', 'drinks', { n: 3 }),
      W('NO NAMES', 'pick', { give: 'Pick someone who can’t say anyone’s name until their next turn', done: 'no saying anyone’s name until your next turn', take: 'No saying anyone’s name until your next turn' }),
      W('HYPE', 'pick', { give: 'Pick someone to hype you up for 10 seconds', done: 'hype up the spinner for 10 seconds', take: 'Hype up the player on your left for 10 seconds' }),
      W('FREE', 'none')
    ] },
    { name: 'Heating up', slices: [
      W('3 DRINKS', 'drinks', { n: 3 }),
      W('BUDDY', 'pick', { give: 'Pick a drinking buddy for the rest of this round', done: 'you’re the spinner’s drinking buddy this round', take: 'You’re the next player’s drinking buddy this round' }),
      W('RULE', 'say', { give: 'Make a rule everyone follows until the game ends', take: 'The player on your right makes a rule' }),
      W('SING', 'pick', { give: 'Pick someone to sing a line of any song', done: 'sing a line of any song', take: 'Sing a line of any song' }),
      W('4 DRINKS', 'drinks', { n: 4 }),
      W('WATERFALL', 'group', { text: 'Waterfall! Everyone starts drinking, and you can’t stop until the person before you does.' }),
      W('SWAP', 'pick', { give: 'Swap a costume piece with anyone you pick', done: 'swap a costume piece with the spinner', take: 'Swap a costume piece with whoever the group picks' }),
      W('SOCIAL', 'all', { n: 1 })
    ] },
    { name: 'Spooky', slices: [
      W('4 DRINKS', 'drinks', { n: 4 }),
      W('GHOST', 'pick', { give: 'Pick a ghost. They can’t talk until their next turn.', done: 'you’re a ghost. No talking until your next turn.', take: 'You’re a ghost. No talking until your next turn.' }),
      W('5 DRINKS', 'drinks', { n: 5 }),
      W('TRUTH', 'pick', { give: 'Ask anyone a truth question', done: 'answer a truth question from the spinner', take: 'Answer a truth question from the group' }),
      W('SOCIAL X2', 'all', { n: 2 }),
      W('MONSTER', 'pick', { give: 'Pick someone to strike their best monster pose for a photo', done: 'best monster pose. Someone grab a photo.', take: 'Strike your best monster pose for a photo' }),
      W('CATEGORY', 'group', { text: 'Spooky category: monsters, horror movies or candy. First to blank drinks.' }),
      W('FREE', 'none')
    ] },
    { name: 'Chaos', slices: [
      W('FINISH IT', 'pick', { w: 3, give: 'Pick someone to finish their drink', done: 'finish your drink', take: 'Finish your drink' }),
      W('6 DRINKS', 'drinks', { n: 6 }),
      W('DARE', 'pick', { give: 'Dare anyone to do anything (keep it legal)', done: 'do a dare from the spinner', take: 'Do a dare from the group' }),
      W('SOCIAL X3', 'all', { n: 3 }),
      W('SHIELD', 'shield'),
      W('ROYAL', 'say', { give: 'You’re royalty. Make a rule for the rest of the night.', take: 'The group makes a rule just for you for the rest of the night' }),
      W('SERENADE', 'pick', { give: 'Pick someone to serenade the room for 15 seconds', done: 'serenade the room for 15 seconds', take: 'Serenade the room for 15 seconds' }),
      W('5 DRINKS', 'drinks', { n: 5 })
    ] }
  ];

  IP.SLICE_TYPES = {
    drinks: 'Drinks',
    all: 'Everyone drinks',
    pick: 'Pick someone',
    say: 'Rule or task',
    group: 'Group game',
    none: 'Free pass',
    shield: 'Bonus Shield'
  };

  IP.SLICE_DEFAULTS = {
    drinks: { n: 2 },
    all: { n: 1 },
    pick: { give: 'Pick someone to do something', done: 'do the thing', take: 'Do the thing yourself' },
    say: { give: 'Make a rule everyone follows', take: 'The group makes a rule for you' },
    group: { text: 'Start a group game' },
    none: {},
    shield: {}
  };

  const str = (v, d, max) => {
    const s = (typeof v === 'string' ? v : '').replace(/\s+/g, ' ').trim();
    return (s || d).slice(0, max || 160);
  };
  const num = (v, d, lo, hi) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d;
  };
  const list = v => Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.keys(v).sort((a, b) => a - b).map(k => v[k]) : []);

  function normSlice(s, fallback) {
    if (!s || !IP.SLICE_TYPES[s.type]) return JSON.parse(JSON.stringify(fallback));
    const d = Object.assign({}, IP.SLICE_DEFAULTS[s.type], fallback && fallback.type === s.type ? fallback : {});
    const out = { label: str(s.label, d.label || 'SLICE', 10).toUpperCase(), type: s.type };
    if (s.type === 'drinks') out.n = num(s.n, d.n || 2, 1, 10);
    if (s.type === 'all') out.n = num(s.n, d.n || 1, 1, 5);
    if (s.type === 'pick') { out.give = str(s.give, d.give); out.done = str(s.done, d.done); out.take = str(s.take, d.take); if (s.w) out.w = num(s.w, 0, 0, 10); }
    if (s.type === 'say') { out.give = str(s.give, d.give); out.take = str(s.take, d.take); }
    if (s.type === 'group') out.text = str(s.text, d.text);
    return out;
  }

  // Always returns 4 wheels of exactly 8 valid slices.
  IP.normalizeWheels = function (w) {
    const src = list(w);
    return IP.DEFAULT_WHEELS.map((def, i) => {
      const wheel = src[i] || {};
      const slices = list(wheel.slices);
      return {
        name: str(wheel.name, def.name, 24),
        slices: def.slices.map((ds, j) => normSlice(slices[j], ds))
      };
    });
  };
  IP.cloneWheels = w => JSON.parse(JSON.stringify(w));
})(window.IP = window.IP || {});
