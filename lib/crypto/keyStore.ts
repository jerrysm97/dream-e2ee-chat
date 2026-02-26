import { openDB } from 'idb';

const DB_NAME = 'zk-terminal-keys';
const STORE = 'keypairs';

async function openKeyDB() {
    return openDB(DB_NAME, 1, {
        upgrade(db) {
            if (!db.objectStoreNames.contains(STORE)) {
                db.createObjectStore(STORE, { keyPath: 'id' });
            }
        },
    });
}

export async function storePrivateKey(key: CryptoKey): Promise<void> {
    // key must be generated with extractable: false
    const db = await openKeyDB();
    const tx = db.transaction(STORE, 'readwrite');
    await tx.objectStore(STORE).put({ id: 'primary', key });
}

export async function loadPrivateKey(): Promise<CryptoKey | null> {
    const db = await openKeyDB();
    const tx = db.transaction(STORE, 'readonly');
    const result = await tx.objectStore(STORE).get('primary');
    return result?.key ?? null;
}

export async function clearKeyStore(): Promise<void> {
    const db = await openKeyDB();
    const tx = db.transaction(STORE, 'readwrite');
    await tx.objectStore(STORE).clear();
}

// Key generation — non-extractable private key
export async function generateKeypair() {
    return crypto.subtle.generateKey(
        { name: 'ECDH', namedCurve: 'P-256' },
        false, // extractable: false — cannot be stolen by XSS
        ['deriveKey', 'deriveBits']
    );
}
