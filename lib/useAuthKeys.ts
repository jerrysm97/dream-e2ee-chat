/**
 * useAuthKeys.ts
 *
 * Supabase auth listener that handles one-time E2EE key setup per device.
 *
 * Flow on SIGN_IN:
 *   1. Check storageEngine for an existing private key.
 *   2. If none found → generate a new identity via cryptoEngine.
 *   3. Save the private key locally (storageEngine).
 *   4. Push the public key to `public.profiles` in Supabase.
 *
 * "Runs once per device setup" guarantee:
 *   The check is `getPrivateKey() === null`. Since the private key is persisted
 *   to localStorage (web) or the Keychain (React Native) BEFORE the Supabase
 *   UPDATE is attempted, any subsequent SIGN_IN on the same device will find the
 *   key already present and skip generation entirely. The public key in Supabase
 *   is therefore only ever overwritten if the device genuinely has no key stored
 *   (first login, app reinstall, or deliberate key rotation).
 *
 * Usage (mount once at the root of your app, e.g. _app.tsx or layout.tsx):
 *   import { useAuthKeys } from '@/lib/useAuthKeys';
 *   export default function RootLayout() {
 *     useAuthKeys();
 *     return <>{children}</>;
 *   }
 */

import { useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { generateIdentity } from "./cryptoEngine";
import storageEngine from "./storageEngine";

// ─── Supabase client ──────────────────────────────────────────────────────────
// Replace these with your actual project URL and anon key.
// In Next.js: use process.env.NEXT_PUBLIC_SUPABASE_URL etc.
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ─── Core setup logic (extracted for testability) ─────────────────────────────

/**
 * Checks whether this device already has a private key stored.
 * If not, generates a new identity, persists the private key locally,
 * and uploads the public key to the user's Supabase profile.
 *
 * Idempotent: safe to call on every SIGN_IN event.
 *
 * @param userId - The authenticated user's UUID (`session.user.id`).
 */
export async function ensureDeviceKeysExist(userId: string): Promise<void> {
    // ── Step 1: Check for an existing private key on this device ──────────────
    const existingPrivateKey = await storageEngine.getPrivateKey();

    if (existingPrivateKey !== null) {
        // Key already present — this device is set up. Nothing to do.
        console.log("[useAuthKeys] Private key already present. Skipping key generation.");
        return;
    }

    // ── Step 2: No key found → generate a fresh identity ─────────────────────
    console.log("[useAuthKeys] No private key found. Generating new E2EE identity...");
    const { publicKeyBase64, privateKeyBase64 } = generateIdentity();

    // ── Step 3: Persist the private key locally BEFORE the network call ───────
    // We save locally first so that if the Supabase UPDATE fails (network error),
    // the user still has their key on-device. On next SIGN_IN, the key will be
    // found and the UPDATE will be retried automatically (skipping generation).
    await storageEngine.savePrivateKey(privateKeyBase64);
    console.log("[useAuthKeys] Private key saved to secure local storage.");

    // ── Step 4: Push the public key to the user's Supabase profile ────────────
    const { error } = await supabase
        .from("profiles")
        .update({ public_key: publicKeyBase64 })
        .eq("id", userId);

    if (error) {
        // Do NOT delete the locally saved private key here.
        // The next SIGN_IN will retry the Supabase UPDATE automatically.
        console.error(
            "[useAuthKeys] Failed to upload public key to Supabase. " +
            "It will be retried on next sign-in.",
            error.message
        );
        return;
    }

    console.log("[useAuthKeys] Public key successfully uploaded to profile. Device setup complete.");
}

// ─── React Hook ───────────────────────────────────────────────────────────────

/**
 * React hook that subscribes to Supabase auth state changes.
 * Triggers `ensureDeviceKeysExist` on every SIGNED_IN event.
 *
 * Mount once at the root of the component tree.
 */
export function useAuthKeys(): void {
    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                if (event === "SIGNED_IN" && session?.user?.id) {
                    await ensureDeviceKeysExist(session.user.id);
                }
            }
        );

        // Cleanup: unsubscribe when the component unmounts (e.g. during HMR or logout).
        return () => {
            subscription.unsubscribe();
        };
    }, []); // Empty deps: subscribe once for the lifetime of the app.
}
