// Flyer-Gestaltungen und Hintergrundbilder bleiben ausschließlich im Browser.
// Ein Datensatz gehört genau zu einem Konto und Turnier und läuft nach einem Monat ohne Nutzung ab.
const DATABASE = 'ptm-flyer-backgrounds';
const STORE = 'backgrounds';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function keyFor(userId, tournamentId) {
  return userId && tournamentId ? `${userId}:${tournamentId}` : '';
}

function openDatabase() {
  if (!globalThis.indexedDB) return Promise.reject(new Error('indexeddb-unavailable'));
  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'key' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('indexeddb-open'));
  });
}

async function readRecord(key) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readonly');
    const request = transaction.objectStore(STORE).get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error('indexeddb-request'));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => reject(transaction.error || new Error('indexeddb-transaction'));
  });
}

async function updateRecord(key, update) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readwrite');
    const store = transaction.objectStore(STORE);
    const read = store.get(key);
    let result = null;
    read.onsuccess = () => {
      result = update(read.result || { key });
      if (result) store.put({ ...result, key, updatedAt: Date.now() });
      else store.delete(key);
    };
    read.onerror = () => reject(read.error || new Error('indexeddb-request'));
    transaction.oncomplete = () => { database.close(); resolve(result); };
    transaction.onerror = () => reject(transaction.error || new Error('indexeddb-transaction'));
  });
}

/** Entfernt beim App-Start alle Flyer-Datensätze, die länger als einen Monat nicht genutzt wurden. */
export async function pruneExpiredFlyerDesigns(now = Date.now()) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readwrite');
    const request = transaction.objectStore(STORE).openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      if (!Number.isFinite(cursor.value.updatedAt) || now - cursor.value.updatedAt > MAX_AGE_MS) cursor.delete();
      cursor.continue();
    };
    request.onerror = () => reject(request.error || new Error('indexeddb-cursor'));
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => reject(transaction.error || new Error('indexeddb-transaction'));
  });
}

export async function loadFlyerLocalDesign(userId, tournamentId) {
  const key = keyFor(userId, tournamentId);
  if (!key) return null;
  const record = await readRecord(key);
  if (!record) return null;
  if (!Number.isFinite(record.updatedAt) || Date.now() - record.updatedAt > MAX_AGE_MS) {
    await updateRecord(key, () => null);
    return null;
  }
  // Öffnen zählt als Nutzung und verlängert die einmonatige Aufbewahrungsfrist.
  return updateRecord(key, () => record);
}

export async function saveFlyerLocalConfig(userId, tournamentId, config) {
  const key = keyFor(userId, tournamentId);
  if (!key) throw new Error('invalid-flyer-key');
  return updateRecord(key, (record) => ({ ...record, config }));
}

export async function saveFlyerBackground(userId, tournamentId, blob, active = true) {
  const key = keyFor(userId, tournamentId);
  if (!key || !(blob instanceof Blob)) throw new Error('invalid-background');
  return updateRecord(key, (record) => ({ ...record, blob, active }));
}

export async function saveFlyerBackgroundPanelTransparency(userId, tournamentId, transparency) {
  const key = keyFor(userId, tournamentId);
  if (!key) throw new Error('invalid-flyer-key');
  const value = Math.min(100, Math.max(0, Math.round(Number(transparency) || 0)));
  return updateRecord(key, (record) => ({ ...record, backgroundPanelTransparency: value }));
}

export async function setFlyerBackgroundActive(userId, tournamentId, active) {
  const key = keyFor(userId, tournamentId);
  if (!key) return null;
  return updateRecord(key, (record) => (record.blob ? { ...record, active } : record));
}

export async function removeFlyerBackground(userId, tournamentId) {
  const key = keyFor(userId, tournamentId);
  if (!key) return;
  return updateRecord(key, (record) => {
    const { blob, active, ...withoutBackground } = record;
    return withoutBackground.config ? withoutBackground : null;
  });
}
