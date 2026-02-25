/**
 * storageEngine.ts
 *
 * Abstracted storage utility for the user's E2EE private key.
 *
 * ─── ⚠️  REACT NATIVE MIGRATION WARNING ────────────────────────────────────────
 * This file currently uses `localStorage` for web browser environments.
 *
 * `localStorage` is INSECURE for a production mobile application.
 * Any malicious JavaScript injected via an XSS attack can call:
 *
 *   localStorage.getItem('__e2ee_priv_v1')
 *
 * …and silently steal the user's private key, permanently compromising all
 * past and future messages (since Curve25519 private keys are long-lived).
 *
 * BEFORE migrating this code to React Native / Expo, you MUST replace the
 * entire implementation body of both `savePrivateKey` and `getPrivateKey`
 * to use `expo-secure-store`:
 *
 *   import * as SecureStore from 'expo-secure-store';
 *
 *   savePrivateKey: async (keyBase64) =>
 *     SecureStore.setItemAsync(PRIVATE_KEY_STORAGE_ID, keyBase64),
 *
 *   getPrivateKey: async () =>
 *     SecureStore.getItemAsync(PRIVATE_KEY_STORAGE_ID),
 *
 * `expo-secure-store` uses the iOS Keychain and Android Keystore, both of
 * which are hardware-backed secure enclaves inaccessible to other apps or
 * injected scripts.
 *
 * The interface `StorageEngine` is intentionally kept identical so this swap
 * requires zero changes to any calling code.
 * ────────────────────────────────────────────────────────────────────────────────
 *
 * Storage key naming: The prefix `__e2ee_priv_v1` is intentionally verbose to:
 *   1. Avoid accidental collisions with third-party libraries.
 *   2. Make it immediately obvious during debugging what this value contains.
 *   3. Allow future key rotations (bump to `_v2`) without silent overwrites.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * The localStorage/SecureStore key under which the user's Base64-encoded
 * Curve25519 private key is persisted. Never rename this without a migration.
 */
const PRIVATE_KEY_STORAGE_ID = "__e2ee_priv_v1" as const;

// ─── Interface ────────────────────────────────────────────────────────────────

export interface StorageEngine {
    /**
     * Persists the user's Curve25519 private key to secure storage.
     * Call this ONCE after `generateIdentity()` on first launch.
     *
     * @param keyBase64 - The Base64-encoded private key from `cryptoEngine.generateIdentity()`.
     */
    savePrivateKey(keyBase64: string): Promise<void>;

    /**
     * Retrieves the stored Curve25519 private key.
     * Returns `null` if no key has been saved yet (e.g. first launch before onboarding).
     *
     * @returns The Base64-encoded private key, or `null` if not found.
     */
    getPrivateKey(): Promise<string | null>;
}

// ─── Web Implementation (localStorage) ───────────────────────────────────────

/**
 * Web-only implementation of `StorageEngine` backed by `localStorage`.
 *
 * ⚠️  See the migration warning at the top of this file before going to production
 * on any platform that supports `expo-secure-store`.
 */
export const webStorageEngine: StorageEngine = {
    async savePrivateKey(keyBase64: string): Promise<void> {
        if (typeof window === "undefined" || !window.localStorage) {
            throw new Error(
                "[storageEngine] localStorage is not available in this environment. " +
                "Are you running server-side? Use the React Native (SecureStore) implementation instead."
            );
        }

        if (!keyBase64 || keyBase64.trim().length === 0) {
            throw new Error("[storageEngine] Refusing to save an empty private key.");
        }

        localStorage.setItem(PRIVATE_KEY_STORAGE_ID, keyBase64);
    },

    async getPrivateKey(): Promise<string | null> {
        if (typeof window === "undefined" || !window.localStorage) {
            // Server-side render — key is never available on the server.
            return null;
        }

        return localStorage.getItem(PRIVATE_KEY_STORAGE_ID);
    },
};

// ─── Default Export ───────────────────────────────────────────────────────────

/**
 * The active storage engine for this platform.
 * Swap this export to `reactNativeStorageEngine` when migrating to Expo.
 */
export default webStorageEngine;
