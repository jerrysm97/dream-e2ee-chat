import { useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { generateKeypair, storePrivateKey, loadPrivateKey } from "./crypto/keyStore";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function ensureDeviceKeysExist(userId: string): Promise<void> {
    const existingPrivateKey = await loadPrivateKey();

    if (existingPrivateKey !== null) {
        return;
    }

    // Generate keys with extractable: false via crypto.subtle
    const keyPair = await generateKeypair();
    await storePrivateKey(keyPair.privateKey);

    // Extract public key to Base64 for Supabase
    const pubKeyRaw = await crypto.subtle.exportKey("spki", keyPair.publicKey);
    const publicKeyBase64 = btoa(String.fromCharCode(...new Uint8Array(pubKeyRaw)));

    const { error } = await supabase
        .from("profiles")
        .update({ public_key: publicKeyBase64 })
        .eq("id", userId);

    if (error) {
        console.error("Failed to upload public key to Supabase", error.message);
    }
}

export function useAuthKeys(): void {
    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                if (event === "SIGNED_IN" && session?.user?.id) {
                    await ensureDeviceKeysExist(session.user.id);
                }
            }
        );

        // Immediate check on mount if already signed in
        supabase.auth.getSession().then(({ data }) => {
            if (data?.session?.user?.id) {
                ensureDeviceKeysExist(data.session.user.id);
            }
        });

        return () => {
            subscription.unsubscribe();
        };
    }, []);
}
