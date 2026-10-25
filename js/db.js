// Two interchangeable backends with the same small API:
//   FirebaseDB — real multiplayer through Firebase Realtime Database.
//   LocalDB    — an in-memory copy for practice games against bots on one phone.
(function (IP) {
  'use strict';
  const clone = v => (v === undefined || v === null) ? null : JSON.parse(JSON.stringify(v));
  const parts = p => String(p).split('/').filter(Boolean);

  let lastT = 0, seq = 0;
  function pushKey() {
    const t = Date.now();
    if (t === lastT) seq++; else { lastT = t; seq = 0; }
    return 'k' + t.toString(36).padStart(9, '0') + seq.toString(36).padStart(3, '0') + Math.random().toString(36).slice(2, 6);
  }

  IP.LocalDB = function () {
    const root = {};
    const listeners = new Set();
    const getAt = path => {
      let o = root;
      for (const k of parts(path)) { if (o === null || typeof o !== 'object') return null; o = o[k]; if (o === undefined) return null; }
      return o;
    };
    const prune = (o, ks, i) => {
      // remove empty objects on the way back up, like Firebase does
      if (i >= ks.length) return;
      const child = o[ks[i]];
      if (child && typeof child === 'object') { prune(child, ks, i + 1); if (Object.keys(child).length === 0) delete o[ks[i]]; }
    };
    const setAt = (path, val) => {
      const ks = parts(path);
      if (!ks.length) throw new Error('Cannot write to the root');
      let o = root;
      for (let i = 0; i < ks.length - 1; i++) {
        if (o[ks[i]] === null || typeof o[ks[i]] !== 'object') o[ks[i]] = {};
        o = o[ks[i]];
      }
      const last = ks[ks.length - 1];
      if (val === null || val === undefined) delete o[last]; else o[last] = clone(val);
      prune(root, ks, 0);
    };
    let scheduled = false;
    const notify = () => {
      if (scheduled) return;
      scheduled = true;
      Promise.resolve().then(() => {
        scheduled = false;
        for (const l of Array.from(listeners)) {
          if (!listeners.has(l)) continue;
          const v = getAt(l.path);
          if (l.type === 'value') {
            const s = JSON.stringify(v === undefined ? null : v);
            if (s !== l.last) { l.last = s; try { l.cb(clone(v)); } catch (e) { console.error(e); } }
          } else if (l.type === 'conn') {
            if (!l.fired) { l.fired = true; l.cb(true); }
          }
        }
      });
    };
    return {
      kind: 'local',
      now: () => Date.now(),
      get: async path => clone(getAt(path)),
      set: async (path, val) => { setAt(path, val); notify(); },
      update: async (path, obj) => { Object.keys(obj).forEach(k => setAt(path + '/' + k, obj[k])); notify(); },
      remove: async path => { setAt(path, null); notify(); },
      push: async (path, val) => { const key = pushKey(); setAt(path + '/' + key, val); notify(); return key; },
      onValue: (path, cb) => { const l = { path, cb, type: 'value', last: undefined }; listeners.add(l); notify(); return () => listeners.delete(l); },
      transaction: async (path, fn) => {
        const cur = clone(getAt(path));
        const next = fn(cur);
        if (next === undefined) return { committed: false, value: cur };
        setAt(path, next); notify();
        return { committed: true, value: clone(next) };
      },
      presence: path => { setAt(path, true); notify(); },
      onConnected: cb => { const l = { cb, type: 'conn', fired: false, path: '' }; listeners.add(l); notify(); return () => listeners.delete(l); }
    };
  };

  IP.FirebaseDB = function (config) {
    if (!firebase.apps.length) firebase.initializeApp(config);
    const db = firebase.database();
    let offset = 0;
    db.ref('.info/serverTimeOffset').on('value', s => { offset = s.val() || 0; });
    const ref = p => db.ref(p);
    return {
      kind: 'firebase',
      now: () => Date.now() + offset,
      get: async p => { const s = await ref(p).get(); return s.val(); },
      set: (p, v) => ref(p).set(v === undefined ? null : v),
      update: (p, o) => ref(p).update(o),
      remove: p => ref(p).remove(),
      push: async (p, v) => { const r = ref(p).push(); await r.set(v); return r.key; },
      onValue: (p, cb) => { const h = s => cb(s.val()); ref(p).on('value', h); return () => ref(p).off('value', h); },
      transaction: async (p, fn) => {
        const r = await ref(p).transaction(cur => fn(cur));
        return { committed: r.committed, value: r.snapshot.val() };
      },
      presence: p => {
        const r = ref(p);
        db.ref('.info/connected').on('value', s => {
          if (s.val() === true) { r.onDisconnect().set(false); r.set(true); }
        });
      },
      onConnected: cb => {
        const h = s => cb(s.val() === true);
        db.ref('.info/connected').on('value', h);
        return () => db.ref('.info/connected').off('value', h);
      }
    };
  };
})(window.IP = window.IP || {});
