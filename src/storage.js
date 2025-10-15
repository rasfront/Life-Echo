// Simple local storage using IndexedDB. Stores video blobs and thumbnails.
// Schema: DB name 'life-echo', store 'clips' with key auto-increment id.
// Value: { id, filename, timestamp, blob, thumb }

const DB_NAME = 'life-echo';
const DB_VERSION = 1;
const STORE = 'clips';

export class Storage {
  static async init() {
    const db = await openDb();
    return new Storage(db);
  }
  constructor(db) { this.db = db; }

  async saveClip({ filename, blob, timestamp, thumbBlob }) {
    const tx = this.db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const id = await reqToPromise(store.add({ filename, timestamp, blob, thumb: thumbBlob }));
    await txDone(tx);
    return id;
  }

  async listClips() {
    const tx = this.db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const items = await reqToPromise(store.getAll());
    await txDone(tx);
    // sort by timestamp desc
    items.sort((a,b)=> new Date(b.timestamp) - new Date(a.timestamp));
    return items.map(({ id, filename, timestamp }) => ({ id, filename, timestamp }));
  }

  async getClip(id) {
    const tx = this.db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const item = await reqToPromise(store.get(id));
    await txDone(tx);
    if (!item) throw new Error('Клип не найден');
    return item.blob;
  }

  async getThumb(id) {
    const tx = this.db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const item = await reqToPromise(store.get(id));
    await txDone(tx);
    if (!item) throw new Error('Клип не найден');
    return item.thumb;
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        os.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('DB blocked'));
  });
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error('tx aborted'));
    tx.onerror = () => reject(tx.error);
  });
}
