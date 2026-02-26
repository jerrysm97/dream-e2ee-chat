/**
 * cryptoEngine.ts - WebCrypto Edition
 * 
 * Core End-to-End Encryption utility for the ZK-Terminal.
 * Uses WebCrypto API (ECDH P-256 + AES-GCM).
 */

import { padPlaintext, unpadPlaintext } from "./padding";

const ALGO_NAME = "ECDH";
const CURVE = "P-256";

// ─── Key import helper ───────────────────────────────────────────────────────
async function importPublicKey(base64: string): Promise<CryptoKey> {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return crypto.subtle.importKey(
        "spki",
        bytes,
        { name: ALGO_NAME, namedCurve: CURVE },
        true,
        []
    );
}

// ─── AES Key Derivation ──────────────────────────────────────────────────────
async function deriveAesKey(privateKey: CryptoKey, publicKey: CryptoKey): Promise<CryptoKey> {
    return crypto.subtle.deriveKey(
        {
            name: ALGO_NAME,
            public: publicKey
        },
        privateKey,
        {
            name: "AES-GCM",
            length: 256
        },
        false,
        ["encrypt", "decrypt"]
    );
}

// ─── Encrypt Message ─────────────────────────────────────────────────────────
export async function encryptMessage(
    plainText: string,
    recipientPublicKeyBase64: string,
    myPrivateKey: CryptoKey
): Promise<string> {
    // 1. Padding
    const paddedBase64 = padPlaintext(plainText);
    const messageBytes = new TextEncoder().encode(paddedBase64);

    // 2. Key Derivation
    const recipientPublicKey = await importPublicKey(recipientPublicKeyBase64);
    const aesKey = await deriveAesKey(myPrivateKey, recipientPublicKey);

    // 3. Encryption
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        aesKey,
        messageBytes
    );

    // 4. Pack IV + Ciphertext
    const payload = new Uint8Array(iv.length + ciphertext.byteLength);
    payload.set(iv, 0);
    payload.set(new Uint8Array(ciphertext), iv.length);

    return btoa(String.fromCharCode(...payload));
}

// ─── Decrypt Message ─────────────────────────────────────────────────────────
export async function decryptMessage(
    messagePayloadBase64: string,
    senderPublicKeyBase64: string,
    myPrivateKey: CryptoKey
): Promise<string> {
    // 1. Unpack IV + Ciphertext
    const binary = atob(messagePayloadBase64);
    const payload = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        payload[i] = binary.charCodeAt(i);
    }

    if (payload.length <= 12) throw new Error("Payload too short");

    const iv = payload.slice(0, 12);
    const ciphertext = payload.slice(12);

    // 2. Key Derivation
    const senderPublicKey = await importPublicKey(senderPublicKeyBase64);
    const aesKey = await deriveAesKey(myPrivateKey, senderPublicKey);

    // 3. Decryption
    const decryptedBuffer = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        aesKey,
        ciphertext
    );

    // 4. Unpadding
    const paddedBase64 = new TextDecoder().decode(decryptedBuffer as ArrayBuffer);
    return unpadPlaintext(paddedBase64);
}

// ─── Encrypt/Decrypt Binary (for WebRTC streams) ────────────────────────
export async function encryptBinary(
    data: Uint8Array,
    recipientPublicKeyBase64: string,
    myPrivateKey: CryptoKey
): Promise<Uint8Array> {
    const recipientPublicKey = await importPublicKey(recipientPublicKeyBase64);
    const aesKey = await deriveAesKey(myPrivateKey, recipientPublicKey);

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        aesKey,
        data
    );

    const payload = new Uint8Array(iv.length + ciphertext.byteLength);
    payload.set(iv, 0);
    payload.set(new Uint8Array(ciphertext), iv.length);

    return payload;
}

export async function decryptBinary(
    payload: Uint8Array,
    senderPublicKeyBase64: string,
    myPrivateKey: CryptoKey
): Promise<Uint8Array> {
    if (payload.length <= 12) throw new Error("Payload too short");

    const iv = payload.slice(0, 12);
    const ciphertext = payload.slice(12);

    const senderPublicKey = await importPublicKey(senderPublicKeyBase64);
    const aesKey = await deriveAesKey(myPrivateKey, senderPublicKey);

    const decryptedBuffer = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        aesKey,
        ciphertext
    );

    return new Uint8Array(decryptedBuffer);
}
