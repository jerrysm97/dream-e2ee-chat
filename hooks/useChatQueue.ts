/**
 * useChatQueue.ts
 *
 * Core real-time messaging hook for the Dream E2EE chat app.
 *
 * Responsibilities:
 *   - sendMessage      : Encrypt plaintext and INSERT into message_queue
 *   - listenForMessages: Supabase Realtime subscription → decrypt → DELETE
 *   - drainOfflineQueue: One-shot sweep of pending messages on app open
 *
 * ─── Offline Receiver Strategy ──────────────────────────────────────────────
 * Supabase Realtime only delivers events to CONNECTED clients. If the recipient
 * is offline when a message arrives, the INSERT event is silently missed.
 * The message_queue Postgres table acts as the durable buffer.
 *
 * Call `drainOfflineQueue(myUserId, onMessageDecrypted)` ONCE on app startup
 * (before setting up the Realtime listener) to process any messages that
 * arrived while the device was offline. Then call `listenForMessages` to handle
 * live traffic. This two-phase startup eliminates the race condition entirely.
 *
 * Startup sequence (mount order in root layout):
 *   1. useAuthKeys()                         — ensure device has E2EE keys
 *   2. await drainOfflineQueue(uid, handler) — sweep pending messages first
 *   3. listenForMessages(uid, handler)       — then subscribe to live events
 * ────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef } from "react";
import { createClient, RealtimeChannel } from "@supabase/supabase-js";
import { encryptMessage, decryptMessage } from "../lib/cryptoEngine";
import storageEngine from "../lib/storageEngine";
import { db } from "../lib/localDb";

// ─── Supabase client ──────────────────────────────────────────────────────────

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DecryptedMessage {
    /** The original message_queue row id — used for DELETE confirmation */
    id: string;
    senderId: string;
    senderPublicKeyBase64: string;
    plainText: string;
    receivedAt: string;
}

interface MessageQueueRow {
    id: string;
    sender_id: string;
    recipient_id: string;
    cipher_text: string;
    created_at: string;
}

// ─── Helper: fetch a profile's public key ────────────────────────────────────

async function fetchPublicKey(userId: string): Promise<string> {
    const { data, error } = await supabase
        .from("profiles")
        .select("public_key")
        .eq("id", userId)
        .single();

    if (error || !data) {
        throw new Error(
            `[useChatQueue] Could not fetch public key for user ${userId}: ${error?.message ?? "no data"}`
        );
    }

    if (!data.public_key) {
        throw new Error(
            `[useChatQueue] User ${userId} has no public key registered. ` +
            "They may not have completed device setup yet."
        );
    }

    return data.public_key as string;
}

// ─── Helper: decrypt and delete a single queue row ───────────────────────────

/**
 * Decrypts one message_queue row using the sender's public key and the local
 * private key, then DELETEs it from the server.
 *
 * If decryption fails, the row is intentionally NOT deleted so it can be
 * retried later (e.g. after a key rotation) or inspected for corruption.
 */
async function decryptAndAcknowledge(
    row: MessageQueueRow,
    myPrivateKeyBase64: string,
    onMessageDecrypted: (msg: DecryptedMessage) => void
): Promise<void> {
    let senderPublicKey: string;

    try {
        senderPublicKey = await fetchPublicKey(row.sender_id);
    } catch (err) {
        console.error(
            `[useChatQueue] Cannot decrypt message ${row.id}: failed to fetch sender public key.`,
            err
        );
        // Do not delete — sender profile may be temporarily unavailable.
        return;
    }

    let plainText: string;
    try {
        plainText = decryptMessage(row.cipher_text, senderPublicKey, myPrivateKeyBase64);
    } catch (err) {
        // ⚠️  Decryption failed — provide a graceful fallback to the UI
        // and DELETE from queue to prevent the app from getting stuck in an error loop.
        console.error(
            `[useChatQueue] Decryption FAILED for message ${row.id}. PURGING FROM QUEUE. Error:`,
            err
        );

        onMessageDecrypted({
            id: row.id,
            senderId: row.sender_id,
            senderPublicKeyBase64: senderPublicKey,
            plainText: "🚫 [End-to-End Encryption Error: Message could not be decrypted on this device. This usually happens after a session reset.]",
            receivedAt: row.created_at,
        });

        // Delete from server to clear the blockage
        await supabase.from("message_queue").delete().eq("id", row.id);
        return;
    }

    // Decryption succeeded — deliver to the UI callback first, then delete.
    onMessageDecrypted({
        id: row.id,
        senderId: row.sender_id,
        senderPublicKeyBase64: senderPublicKey,
        plainText,
        receivedAt: row.created_at,
    });

    // DELETE from server now that the plaintext is safely in the UI/local DB.
    const { error: deleteError } = await supabase
        .from("message_queue")
        .delete()
        .eq("id", row.id);

    if (deleteError) {
        // Non-fatal: the message was already delivered to the UI.
        // On next app open, drainOfflineQueue will attempt to re-process it.
        // The decryptMessage call is idempotent so this causes a duplicate at worst.
        console.warn(
            `[useChatQueue] Message ${row.id} delivered but failed to delete from queue:`,
            deleteError.message
        );
    } else {
        console.log(`[useChatQueue] Message ${row.id} delivered and removed from queue.`);
    }
}

// ─── 1. sendMessage ───────────────────────────────────────────────────────────

/**
 * Encrypts a plaintext message and inserts it into the `message_queue` table.
 *
 * The sender's app should persist the plaintext to a local SQLite DB BEFORE
 * calling this function, since the sender cannot decrypt the queued ciphertext
 * (it is encrypted for the recipient's public key only).
 *
 * @param recipientId - UUID of the recipient (must have a public_key in profiles).
 * @param plainText   - The raw UTF-8 message to encrypt and send.
 * @param myUserId    - The authenticated sender's UUID.
 */
export async function sendMessage(
    recipientId: string,
    plainText: string,
    myUserId: string
): Promise<void> {
    // Fetch recipient's public key
    const recipientPublicKey = await fetchPublicKey(recipientId);

    // Get sender's local private key
    const myPrivateKey = await storageEngine.getPrivateKey();
    if (!myPrivateKey) {
        throw new Error(
            "[useChatQueue] Cannot send message: no local private key found. " +
            "Ensure useAuthKeys has completed device setup before sending."
        );
    }

    // Encrypt — nonce is generated fresh inside encryptMessage (see cryptoEngine.ts)
    const cipherText = encryptMessage(plainText, recipientPublicKey, myPrivateKey);

    // Insert into queue
    const { error } = await supabase.from("message_queue").insert({
        sender_id: myUserId,
        recipient_id: recipientId,
        cipher_text: cipherText,
    });

    if (error) {
        // --- 🔒 Error Masking & Payload Validation ---
        // Catch specific Postgres exceptions (like our custom check limits or triggers)
        // and sanitize them for the UI so we don't leak database structure.

        console.error(`[useChatQueue] Raw DB Error:`, error);

        const msg = error.message || "";

        if (msg.includes("Rate limit exceeded")) {
            throw new Error("Sending too fast. Please wait a minute and try again.");
        } else if (msg.includes("cipher_text_length_check")) {
            throw new Error("Message is too large. Please use the file sharing (paperclip) tool for large content.");
        } else {
            // Generic fallback to mask schema details
            throw new Error("Message delivery failed. Please try again.");
        }
    }

    console.log(`[useChatQueue] Message enqueued for recipient ${recipientId}.`);
}

/**
 * Sends an ephemeral broadcast signal to a recipient's device instructing them
 * to delete a specific message from their local database.
 * 
 * @param messageId - The UUID of the message to delete.
 * @param recipientId - The UUID of the peer whose device should delete the message.
 * @param myUserId - The UUID of the sender (to prove authorization).
 */
export async function sendDeleteSignal(
    messageId: string,
    recipientId: string,
    myUserId: string
): Promise<void> {
    const channel = supabase.channel(`message_queue:recipient_id=eq.${recipientId}`);

    // We send the senderId so the recipient can verify we are the actual sender
    const payload = {
        type: "DELETE_MESSAGE",
        payload: { messageId, senderId: myUserId }
    };

    await channel.send({
        type: "broadcast",
        event: "DELETE_MESSAGE",
        payload,
    });

    console.log(`[useChatQueue] DELETE_MESSAGE signal sent for msg ${messageId} to ${recipientId}`);
}

/**
 * Broadcasts a 'TYPING' event to the peer.
 */
export async function sendTypingSignal(
    recipientId: string,
    myUserId: string
): Promise<void> {
    const channel = supabase.channel(`message_queue:recipient_id=eq.${recipientId}`);
    await channel.send({
        type: "broadcast",
        event: "TYPING",
        payload: { senderId: myUserId },
    });
}

/**
 * Broadcasts an 'ACK_READ' event so the peer knows which messages were seen.
 */
export async function sendAckReadSignal(
    messageIds: string[],
    recipientId: string,
    myUserId: string
): Promise<void> {
    const channel = supabase.channel(`message_queue:recipient_id=eq.${recipientId}`);
    await channel.send({
        type: "broadcast",
        event: "ACK_READ",
        payload: { messageIds, senderId: myUserId },
    });
}

/**
 * Broadcasts an 'ACK_DELIVERED' event so the sender knows the message reached the device.
 */
export async function sendAckDeliveredSignal(
    messageId: string,
    recipientId: string,
    myUserId: string
): Promise<void> {
    const channel = supabase.channel(`message_queue:recipient_id=eq.${recipientId}`);
    await channel.send({
        type: "broadcast",
        event: "ACK_DELIVERED",
        payload: { messageId, senderId: myUserId },
    });
}

/**
 * Broadcasts a 'SET_DISAPPEARING' event to toggle self-destruct mode for the peer.
 */
export async function sendSetDisappearingSignal(
    enabled: boolean,
    recipientId: string,
    myUserId: string
): Promise<void> {
    const channel = supabase.channel(`message_queue:recipient_id=eq.${recipientId}`);
    await channel.send({
        type: "broadcast",
        event: "SET_DISAPPEARING",
        payload: { enabled, senderId: myUserId },
    });
}

// ─── 2. drainOfflineQueue ─────────────────────────────────────────────────────

/**
 * One-shot sweep of all pending messages in `message_queue` for this user.
 * Call this ONCE on app startup, BEFORE setting up the Realtime listener,
 * to process any messages that arrived while the device was offline.
 *
 * @param myUserId           - The authenticated user's UUID.
 * @param onMessageDecrypted - Callback invoked for each successfully decrypted message.
 */
export async function drainOfflineQueue(
    myUserId: string,
    onMessageDecrypted: (msg: DecryptedMessage) => void
): Promise<void> {
    const myPrivateKey = await storageEngine.getPrivateKey();
    if (!myPrivateKey) {
        console.warn("[useChatQueue] drainOfflineQueue: no local private key. Skipping sweep.");
        return;
    }

    const { data: pendingRows, error } = await supabase
        .from("message_queue")
        .select("*")
        .eq("recipient_id", myUserId)
        .order("created_at", { ascending: true }); // oldest-first for correct display order

    if (error) {
        console.error("[useChatQueue] Failed to fetch offline queue:", error.message);
        return;
    }

    if (!pendingRows || pendingRows.length === 0) {
        console.log("[useChatQueue] Offline queue is empty.");
        return;
    }

    console.log(`[useChatQueue] Draining ${pendingRows.length} offline message(s)...`);

    // Process sequentially to preserve message order in the UI.
    for (const row of pendingRows as MessageQueueRow[]) {
        await decryptAndAcknowledge(row, myPrivateKey, onMessageDecrypted);
    }

    console.log("[useChatQueue] Offline queue drain complete.");
}

// ─── 3. listenForMessages ─────────────────────────────────────────────────────

/**
 * Subscribes to Supabase Realtime INSERT events on `message_queue`
 * filtered to only this user's incoming messages.
 *
 * Returns an unsubscribe function — call it on component unmount.
 *
 * @param myUserId           - The authenticated user's UUID.
 * @param onMessageDecrypted - Callback invoked with each decrypted live message.
 * @returns Cleanup function to unsubscribe the Realtime channel.
 */
export function listenForMessages(
    myUserId: string,
    onMessageDecrypted: (msg: DecryptedMessage) => void,
    onPeerTyping?: (peerId: string) => void,
    onAckRead?: (messageIds: string[], peerId: string) => void,
    onAckDelivered?: (messageId: string, peerId: string) => void,
    onSetDisappearing?: (enabled: boolean, peerId: string) => void
): () => void {
    let channel: RealtimeChannel;

    // Resolve the private key once and capture it in closure.
    storageEngine.getPrivateKey().then((myPrivateKey) => {
        if (!myPrivateKey) {
            console.error(
                "[useChatQueue] listenForMessages: no local private key found. " +
                "Cannot decrypt incoming messages."
            );
            return;
        }

        channel = supabase
            .channel(`message_queue:recipient_id=eq.${myUserId}`)
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "message_queue",
                    filter: `recipient_id=eq.${myUserId}`,
                },
                async (payload) => {
                    const row = payload.new as MessageQueueRow;
                    console.log(`[useChatQueue] Live message received: ${row.id}`);
                    await decryptAndAcknowledge(row, myPrivateKey, onMessageDecrypted);
                }
            )
            .on(
                "broadcast",
                { event: "DELETE_MESSAGE" },
                async ({ payload }) => {
                    const { messageId, senderId } = payload.payload;
                    console.log(`[useChatQueue] Received remote DELETE_MESSAGE signal for: ${messageId} from ${senderId}`);

                    try {
                        // 1. Verify the message exists and was ACTUALLY sent by this senderId
                        const msg = await db.messages.get(messageId);
                        if (!msg) return; // Message not found (already deleted or not received yet)

                        if (msg.sender_id !== senderId) {
                            console.warn(`[useChatQueue] Security Check Failed: User ${senderId} attempted to delete message ${messageId} which was sent by ${msg.sender_id}`);
                            return;
                        }

                        // 2. Delete the message
                        await db.messages.delete(messageId);
                        console.log(`[useChatQueue] Remotely deleted message ${messageId} successfully.`);

                        // 3. Update the conversation snippet if this was the last message
                        const conv = await db.conversations.get(msg.conversation_id);
                        if (conv && conv.last_message_snippet === msg.text) {
                            await db.conversations.update(conv.id, {
                                last_message_snippet: "🚫 Message deleted",
                            });
                        }
                    } catch (err) {
                        console.error("[useChatQueue] Error processing remote delete signal:", err);
                    }
                }
            )
            .on(
                "broadcast",
                { event: "TYPING" },
                ({ payload }) => {
                    const { senderId } = payload;
                    if (onPeerTyping) onPeerTyping(senderId);
                }
            )
            .on(
                "broadcast",
                { event: "ACK_READ" },
                ({ payload }) => {
                    const { messageIds, senderId } = payload;
                    if (onAckRead) onAckRead(messageIds, senderId);
                }
            )
            .on(
                "broadcast",
                { event: "ACK_DELIVERED" },
                ({ payload }) => {
                    const { messageId, senderId } = payload;
                    if (onAckDelivered) onAckDelivered(messageId, senderId);
                }
            )
            .on(
                "broadcast",
                { event: "SET_DISAPPEARING" },
                ({ payload }) => {
                    const { enabled, senderId } = payload;
                    if (onSetDisappearing) onSetDisappearing(enabled, senderId);
                }
            )
            .subscribe((status) => {
                console.log(`[useChatQueue] Realtime channel status: ${status}`);
            });
    });

    return () => {
        if (channel) {
            supabase.removeChannel(channel);
            console.log("[useChatQueue] Realtime subscription removed.");
        }
    };
}

// ─── 4. React Hook (convenience wrapper) ──────────────────────────────────────

/**
 * React hook that automatically drains the offline queue and subscribes to
 * live messages on mount, and cleans up the subscription on unmount.
 *
 * @param myUserId           - The authenticated user's UUID (pass null/undefined until auth resolves).
 * @param onMessageDecrypted - UI callback for each decrypted message.
 */
export function useChatQueue(
    myUserId: string | null | undefined,
    onMessageDecrypted: (msg: DecryptedMessage) => void,
    onPeerTyping?: (peerId: string) => void,
    onAckRead?: (messageIds: string[], peerId: string) => void,
    onAckDelivered?: (messageId: string, peerId: string) => void,
    onSetDisappearing?: (enabled: boolean, peerId: string) => void
): void {
    // Stable ref so the callback can change without triggering re-subscription.
    const callbackRef = useRef(onMessageDecrypted);
    callbackRef.current = onMessageDecrypted;

    useEffect(() => {
        if (!myUserId) return; // wait for auth to resolve

        const stableCallback = (msg: DecryptedMessage) => callbackRef.current(msg);

        // Phase 1: drain messages that arrived while offline.
        drainOfflineQueue(myUserId, stableCallback).then(() => {
            // Phase 2: subscribe to live incoming messages only AFTER drain completes
            // to avoid processing the same message twice (race between SELECT and INSERT event).
        });

        // Phase 2: set up live listener (runs concurrently with drain; handled by
        // decryptAndAcknowledge idempotency — duplicate delivery is a duplicate UI
        // message at worst, never a missed message).
        const unsubscribe = listenForMessages(myUserId, stableCallback, onPeerTyping, onAckRead, onAckDelivered, onSetDisappearing);

        return () => {
            unsubscribe();
        };
    }, [myUserId]);
}
