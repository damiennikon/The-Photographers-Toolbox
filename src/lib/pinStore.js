// Local-only persistence for Map Locations pins. First IndexedDB usage in
// this repo — kept as a small dependency-free wrapper around a single
// object store rather than pulling in a library, since one store with a
// handful of operations doesn't need one.
const DB_NAME = "pt-map-locations";
const DB_VERSION = 1;
const STORE_NAME = "pins";

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) {
        req.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function createPinId() {
  return `pin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function getAllPins() {
  const db = await openDb();
  const store = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME);
  return reqToPromise(store.getAll());
}

export async function savePin(pin) {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).put(pin);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(pin);
    tx.onerror = () => reject(tx.error);
  });
}

export async function updatePinPosition(id, lat, lng) {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  const getReq = store.get(id);
  getReq.onsuccess = () => {
    if (getReq.result) store.put({ ...getReq.result, lat, lng });
  };
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Backfills the address on pins saved before this field existed, or ones
// whose reverse-geocode lookup failed at save time — see mapLocations.js's
// popupopen handler.
export async function updatePinAddress(id, address) {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  const getReq = store.get(id);
  getReq.onsuccess = () => {
    if (getReq.result) store.put({ ...getReq.result, address });
  };
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deletePin(id) {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).delete(id);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
