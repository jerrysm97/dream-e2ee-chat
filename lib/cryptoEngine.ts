/**
 * cryptoEngine.ts
 *
 * Core End-to-End Encryption utility for the Dream messaging app.
 * Uses nacl.box (Curve25519 key agreement + XSalsa20-Poly1305 AEAD).
 *
 * Nonce Strategy: Each call to encryptMessage() generates a CRYPTOGRAPHICALLY
 * RANDOM 24-byte one-time nonce via nacl.randomBytes(). The nonce is prepended
 * to the ciphertext and transmitted together as a single Base64 payload.
 * This completely eliminates nonce-reuse attacks — the receiver always extracts
 * the nonce from the first 24 bytes of the payload before decrypting.
 *
 * Libraries: tweetnacl, tweetnacl-util
 */

import nacl from "tweetnacl";
import { encodeBase64, decodeBase64 } from "tweetnacl-util";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Identity {
    /** Curve25519 public key, Base64-encoded. Safe to store in Supabase profiles.public_key */
    publicKeyBase64: string;
    /** Curve25519 private key, Base64-encoded. NEVER leave the device. Store in SecureStore / Keychain. */
    privateKeyBase64: string;
}

// ─── 1. generateIdentity ──────────────────────────────────────────────────────

/**
 * Generates a new Curve25519 key pair for use with nacl.box.
 *
 * Call this ONCE on first launch and persist the result to secure device storage.
 * The public key is uploaded to Supabase so other users can encrypt messages to you.
 * The private key NEVER leaves the device.
 *
 * @returns An `Identity` object containing both keys as Base64 strings.
 */
export function generateIdentity(): Identity {
    const keyPair = nacl.box.keyPair();

    return {
        publicKeyBase64: encodeBase64(keyPair.publicKey),
        privateKeyBase64: encodeBase64(keyPair.secretKey),
    };
}

// ─── 2. encryptMessage ────────────────────────────────────────────────────────

/**
 * Encrypts a UTF-8 plaintext message for a specific recipient.
 *
 * Nonce handling: A fresh 24-byte random nonce is generated for EVERY call.
 * The final payload is structured as:
 *   [ nonce (24 bytes) | ciphertext (variable) ] — all encoded as a single Base64 string.
 *
 * IMPORTANT: The sender's app must persist a local copy of the plaintext
 * (e.g. in SQLite) BEFORE calling this function. Once encrypted for the
 * recipient's public key, not even the sender can decrypt the ciphertext.
 *
 * @param plainText                  - The UTF-8 message to encrypt.
 * @param recipientPublicKeyBase64   - The recipient's Curve25519 public key (from their Supabase profile).
 * @param myPrivateKeyBase64         - The sender's Curve25519 private key (from secure device storage).
 * @returns A Base64-encoded string containing the nonce prepended to the ciphertext.
 * @throws Error if encryption unexpectedly fails.
 */
export function encryptMessage(
    plainText: string,
    recipientPublicKeyBase64: string,
    myPrivateKeyBase64: string
): string {
    const recipientPublicKey = decodeBase64(recipientPublicKeyBase64);
    const myPrivateKey = decodeBase64(myPrivateKeyBase64);
    // Use native TextEncoder — perfect Uint8Array type, no tweetnacl-util interop issues.
    const messageBytes: Uint8Array = new TextEncoder().encode(plainText);

    // Generate a unique, cryptographically random 24-byte nonce.
    // nacl.box.nonceLength === 24.
    const nonce = nacl.randomBytes(nacl.box.nonceLength);

    const ciphertext = nacl.box(messageBytes, nonce, recipientPublicKey, myPrivateKey);

    if (!ciphertext) {
        // nacl.box should never return null for valid inputs, but guard defensively.
        throw new Error("[cryptoEngine] Encryption failed unexpectedly.");
    }

    // Pack nonce + ciphertext into a single Uint8Array for a single Base64 field.
    // Structure: | nonce: 24 bytes | ciphertext: N bytes |
    const payload = new Uint8Array(nonce.length + ciphertext.length);
    payload.set(nonce, 0);
    payload.set(ciphertext, nonce.length);

    return encodeBase64(payload);
}

// ─── 3. decryptMessage ────────────────────────────────────────────────────────

/**
 * Decrypts an E2EE message payload received from the server.
 *
 * Extracts the 24-byte nonce from the front of the payload, then uses it with
 * the sender's public key and the recipient's private key to decrypt.
 *
 * @param messagePayloadBase64   - The Base64 payload from `message_queue.cipher_text`.
 * @param senderPublicKeyBase64  - The sender's Curve25519 public key (from their Supabase profile).
 * @param myPrivateKeyBase64     - The recipient's own Curve25519 private key (from secure device storage).
 * @returns The decrypted UTF-8 plaintext string.
 * @throws Error with a clear message if decryption fails (e.g. tampered data, wrong keys).
 */
export function decryptMessage(
    messagePayloadBase64: string,
    senderPublicKeyBase64: string,
    myPrivateKeyBase64: string
): string {
    let payload: Uint8Array;

    // ── Input validation ──────────────────────────────────────────────────────
    try {
        payload = decodeBase64(messagePayloadBase64);
    } catch {
        throw new Error("[cryptoEngine] Decryption failed: payload is not valid Base64.");
    }

    if (payload.length <= nacl.box.nonceLength) {
        throw new Error(
            `[cryptoEngine] Decryption failed: payload too short to contain a nonce. ` +
            `Expected > ${nacl.box.nonceLength} bytes, got ${payload.length}.`
        );
    }

    // ── Unpack nonce and ciphertext ───────────────────────────────────────────
    const nonce = payload.slice(0, nacl.box.nonceLength);
    const ciphertext = payload.slice(nacl.box.nonceLength);

    let senderPublicKey: Uint8Array;
    let myPrivateKey: Uint8Array;

    try {
        senderPublicKey = decodeBase64(senderPublicKeyBase64);
        myPrivateKey = decodeBase64(myPrivateKeyBase64);
    } catch {
        throw new Error("[cryptoEngine] Decryption failed: one or more keys are not valid Base64.");
    }

    // ── Decrypt ───────────────────────────────────────────────────────────────
    // nacl.box.open returns null if authentication fails (tampered ciphertext,
    // wrong keys, or a replayed / corrupted nonce).
    const decryptedBytes = nacl.box.open(ciphertext, nonce, senderPublicKey, myPrivateKey);

    if (decryptedBytes === null) {
        // DO NOT expose internal details (key values, etc.) in the error message.
        throw new Error(
            "[cryptoEngine] Decryption failed: message authentication failed. " +
            "The message may have been tampered with, or the wrong keys were used."
        );
    }

    try {
        // Use native TextDecoder — decryptedBytes is Uint8Array, no type coercion needed.
        return new TextDecoder().decode(decryptedBytes);
    } catch {
        throw new Error(
            "[cryptoEngine] Decryption succeeded but result could not be decoded as UTF-8. " +
            "The plaintext may be binary or corrupt."
        );
    }
}

// ─── 4. encryptBinary ─────────────────────────────────────────────────────────

/**
 * Encrypts raw binary data for a specific recipient.
 * Used for file chunks in P2P file transfers.
 *
 * @param data                       - The Uint8Array to encrypt.
 * @param recipientPublicKeyBase64   - The recipient's Curve25519 public key.
 * @param myPrivateKeyBase64         - The sender's Curve25519 private key.
 * @returns A Uint8Array containing the nonce prepended to the ciphertext.
 */
export function encryptBinary(
    data: Uint8Array,
    recipientPublicKeyBase64: string,
    myPrivateKeyBase64: string
): Uint8Array {
    const recipientPublicKey = decodeBase64(recipientPublicKeyBase64);
    const myPrivateKey = decodeBase64(myPrivateKeyBase64);

    const nonce = nacl.randomBytes(nacl.box.nonceLength);
    const ciphertext = nacl.box(data, nonce, recipientPublicKey, myPrivateKey);

    if (!ciphertext) {
        throw new Error("[cryptoEngine] Binary encryption failed unexpectedly.");
    }

    const payload = new Uint8Array(nonce.length + ciphertext.length);
    payload.set(nonce, 0);
    payload.set(ciphertext, nonce.length);

    return payload;
}

// ─── 5. decryptBinary ─────────────────────────────────────────────────────────

/**
 * Decrypts a binary E2EE payload.
 *
 * @param payload                - The binary payload (nonce + ciphertext).
 * @param senderPublicKeyBase64  - The sender's Curve25519 public key.
 * @param myPrivateKeyBase64     - The recipient's own Curve25519 private key.
 * @returns The decrypted Uint8Array data.
 */
export function decryptBinary(
    payload: Uint8Array,
    senderPublicKeyBase64: string,
    myPrivateKeyBase64: string
): Uint8Array {
    if (payload.length <= nacl.box.nonceLength) {
        throw new Error(
            `[cryptoEngine] Binary decryption failed: payload too short.`
        );
    }

    const nonce = payload.slice(0, nacl.box.nonceLength);
    const ciphertext = payload.slice(nacl.box.nonceLength);

    const senderPublicKey = decodeBase64(senderPublicKeyBase64);
    const myPrivateKey = decodeBase64(myPrivateKeyBase64);

    const decryptedBytes = nacl.box.open(ciphertext, nonce, senderPublicKey, myPrivateKey);

    if (decryptedBytes === null) {
        throw new Error("[cryptoEngine] Binary decryption authentication failed.");
    }

    return decryptedBytes;
}

