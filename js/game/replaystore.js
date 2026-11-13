// Saved match replays in IndexedDB (this browser only). Keeps the most recent few.
const DB = 'jps-replays', STORE = 'replays', KEEP = 8;

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode), store = t.objectStore(STORE);
    const out = fn(store);
    t.oncomplete = () => resolve(out?.result ?? out);
    t.onerror = () => reject(t.error);
  });
}

export async function saveReplay(data) {
  const db = await open();
  const id = data.matchId + '-' + Date.now().toString(36);
  await tx(db, 'readwrite', (s) => s.put({ ...data, id, savedAt: Date.now() }));
  // Trim to the newest KEEP.
  const all = await listReplays();
  for (const r of all.slice(KEEP)) await deleteReplay(r.id);
  return id;
}

// Summaries only (no frames), newest first.
export async function listReplays() {
  const db = await open();
  const rows = await new Promise((resolve, reject) => {
    const out = [];
    const req = db.transaction(STORE).objectStore(STORE).openCursor();
    req.onsuccess = () => {
      const c = req.result;
      if (!c) return resolve(out);
      const { frames, events, ...meta } = c.value;
      out.push({ ...meta, kills: events.filter((e) => e.k === 'ev' && e.n === 'kill').length });
      c.continue();
    };
    req.onerror = () => reject(req.error);
  });
  return rows.sort((a, b) => b.savedAt - a.savedAt);
}

export async function loadReplay(id) {
  const db = await open();
  return tx(db, 'readonly', (s) => s.get(id));
}

export async function deleteReplay(id) {
  const db = await open();
  return tx(db, 'readwrite', (s) => s.delete(id));
}
