// Local persistence for scouting pins and shoot plans.
const DB_NAME = "pt-map-locations";
const STORE_NAME = "pins";
const SHOOTS_STORE = "shoots";

function database(name, storeName) {
  let pending;
  return () => pending ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(storeName, { keyPath: "id" });
    };
    req.onsuccess = () => {
      req.result.onversionchange = () => {
        req.result.close();
        pending = null;
      };
      resolve(req.result);
    };
    req.onerror = () => {
      pending = null;
      reject(req.error);
    };
  });
}

const openDb = database(DB_NAME, STORE_NAME);
const openShootsDb = database("pt-shoot-plans", SHOOTS_STORE);

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

export async function getPin(id) {
  const db = await openDb();
  return reqToPromise(db.transaction(STORE_NAME).objectStore(STORE_NAME).get(id));
}

export async function restorePins(pins) {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  const added = [];
  for (const pin of pins) {
    const request = store.getKey(pin.id);
    request.onsuccess = () => {
      if (request.result !== undefined) return;
      store.add(pin);
      added.push(pin);
    };
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(added);
    tx.onabort = () => reject(tx.error);
  });
}

export async function getShoots() {
  const db = await openShootsDb();
  return reqToPromise(db.transaction(SHOOTS_STORE).objectStore(SHOOTS_STORE).getAll());
}

async function changeShoots(write) {
  const db = await openShootsDb();
  const tx = db.transaction(SHOOTS_STORE, "readwrite");
  write(tx.objectStore(SHOOTS_STORE));
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onabort = () => reject(tx.error);
  });
}

export function saveShoot(shoot) {
  return changeShoots((store) => store.add(shoot));
}

export function deleteShoot(id) {
  return changeShoots((store) => store.delete(id));
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
