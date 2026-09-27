// Data layer backed by Firebase Firestore.
//
// Keeps the exact same exported functions (dbGet, dbSet, dbGetAll) that
// App.tsx already imports, so nothing else in the app needs to change.
// Each "key" (players, organizers, draft, games, chat) is stored as one
// document in the "app_data" collection, under a field called "value".
import { doc, getDoc, setDoc, collection, getDocs, query, where, documentId } from 'firebase/firestore';
import { db } from './firebase';

const COLLECTION = 'app_data';

export async function dbGet<T>(key: string, fallback: T): Promise<T> {
  try {
    const snap = await getDoc(doc(db, COLLECTION, key));
    if (snap.exists()) {
      const data = snap.data();
      return data && 'value' in data ? (data.value as T) : fallback;
    }
    return fallback;
  } catch (e) {
    console.warn('dbGet failed for', key, e);
    // fall back to localStorage on network/config error
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch {
      return fallback;
    }
  }
}

export async function dbSet(key: string, value: unknown): Promise<void> {
  // Write to localStorage immediately for snappy local feel
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  // Then persist to Firestore
  try {
    await setDoc(doc(db, COLLECTION, key), { value });
  } catch (e) {
    console.warn('dbSet failed for', key, e);
  }
}

export async function dbGetAll(keys: string[]): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  try {
    // Firestore's "in" filter on documentId() supports up to 30 keys at once,
    // which comfortably covers this app's 5 keys (players/organizers/draft/games/chat).
    const q = query(collection(db, COLLECTION), where(documentId(), 'in', keys));
    const snap = await getDocs(q);
    keys.forEach(k => { out[k] = null; });
    snap.forEach(d => {
      const data = d.data();
      out[d.id] = data && 'value' in data ? data.value : null;
    });
    return out;
  } catch (e) {
    console.warn('dbGetAll failed', e);
    keys.forEach(k => {
      try { const v = localStorage.getItem(k); out[k] = v ? JSON.parse(v) : null; } catch { out[k] = null; }
    });
    return out;
  }
}
