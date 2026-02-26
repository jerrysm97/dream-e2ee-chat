/**
 * localDb.ts
 *
 * Local IndexedDB database for the Dream E2EE chat app, powered by Dexie.js.
 *
 * This database is the CLIENT-SIDE source of truth for all chat history.
 * Decrypted plaintext is NEVER stored on the Supabase server — only the
 * ephemeral encrypted ciphertext in `message_queue` lives there, and it is
 * deleted immediately after delivery. Everything here lives only on this device.
 *
 * ─── Schema Version Notes ────────────────────────────────────────────────────
 * Dexie uses integer version numbers to manage schema migrations.
 * NEVER rename or remove an indexed field without incrementing the version
 * and providing an `upgrade()` handler. Failing to do so corrupts existing
 * IndexedDB stores for users who already have data.
 *
 * Current version: 3
 * ────────────────────────────────────────────────────────────────────────────
 */

import Dexie, { type EntityTable } from "dexie";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Represents a chat thread with a single peer.
 * One row per unique conversation (identified by the peer's user ID).
 */
export interface Conversation {
    /** Stable UUID for this conversation row. Typically the peer's user ID. */
    id: string;
    /** UUID of the other participant. Indexed for fast lookups by peer. */
    peer_id: string;
    /** Peer's Curve25519 public key, cached locally to avoid repeated Supabase fetches. */
    peer_public_key: string;
    /** Peer's human-readable tag (e.g. #AB3X7K). Optional — populated after peer discovery. */
    peer_tag?: string;
    /** A truncated preview of the last message (plaintext). Shown in the conversation list. */
    last_message_snippet: string;
    /**
     * Unix timestamp (ms) of the last activity. Used to sort the conversation list
     * by recency. Stored as a number, not a Date, for efficient IndexedDB range queries.
     */
    updated_at: number;
    /** Whether disappearing messages are enabled for this conversation */
    self_destruct?: boolean;
}

/**
 * Represents a single decrypted message in a conversation.
 * Stored locally after successful decryption — NEVER the ciphertext.
 */
export interface Message {
    /** The original UUID from `message_queue.id`. Doubles as the local primary key. */
    id: string;
    /** UUID of the parent conversation. Indexed for fast per-conversation queries. */
    conversation_id: string;
    /** UUID of the message author (either the local user or the peer). */
    sender_id: string;
    /** The decrypted UTF-8 plaintext content of the message. */
    text: string;
    /**
     * Unix timestamp (ms) when the message was created.
     * Stored as a number for efficient Dexie range queries (e.g. WHERE timestamp > X).
     */
    timestamp: number;
    /**
     * Delivery status of the message:
     *  - 'sending'   : waiting to be uploaded to Supabase
     *  - 'sent'      : inserted into message_queue on the server
     *  - 'delivered' : pulled from message_queue and decrypted by the recipient
     *  - 'read'      : recipient has opened and viewed the message thread
     */
    status: "sending" | "sent" | "delivered" | "read";
    /** Unix timestamp (ms) when this message should be auto-deleted (if self_destruct is on) */
    delete_at?: number;
    /** UUID of the original message being replied to, if any */
    reply_to_id?: string;
    /** Truncated snippet of the original message being replied to */
    reply_snippet?: string;
    /** URL of an attached image (stored in Supabase Storage) */
    image_url?: string;
}

// ─── Database Class ───────────────────────────────────────────────────────────

class ChatAppDatabase extends Dexie {
    /**
     * Typed table for conversation metadata.
     * `EntityTable<Conversation, 'id'>` informs TypeScript that 'id' is the primary key
     * and makes the `id` field optional when calling `db.conversations.add()`.
     */
    conversations!: EntityTable<Conversation, "id">;

    /**
     * Typed table for decrypted message history.
     * `EntityTable<Message, 'id'>` informs TypeScript that 'id' is the primary key.
     */
    messages!: EntityTable<Message, "id">;

    constructor() {
        super("ChatAppDB");

        /**
         * Schema definition for version 1.
         *
         * Dexie index syntax:
         *   '&field' → unique primary key
         *   'field'  → non-unique index
         *   '*field' → multi-entry index (for arrays)
         *
         * Only declare fields that need to be QUERIED/INDEXED here.
         * Non-indexed fields (text, status, peer_public_key, etc.) are still
         * stored in full — they just can't be used as WHERE clause filters via Dexie's API.
         */
        this.version(1).stores({
            conversations:
                "&id, " +   // primary key — unique, prevents duplicate conversation rows
                "peer_id, " + // indexed: look up conversation by the other participant's UUID
                "updated_at",  // indexed: sort conversation list by recency efficiently

            messages:
                "&id, " +             // primary key — maps to the original message_queue UUID
                "conversation_id, " + // indexed: fetch all messages in a thread with .where('conversation_id').equals(x)
                "timestamp",          // indexed: range queries for pagination or date separators
        });

        this.version(2).stores({
            conversations: "&id, peer_id, peer_tag, updated_at",
            messages: "&id, conversation_id, timestamp",
        }).upgrade(tx => {
            return tx.table("conversations").toCollection().modify(conv => {
                conv.peer_tag = conv.peer_tag || "";
            });
        });

        this.version(3).stores({
            conversations: "&id, peer_id, peer_tag, updated_at",
            messages: "&id, conversation_id, timestamp, delete_at",
        }).upgrade(tx => {
            return tx.table("conversations").toCollection().modify(conv => {
                conv.self_destruct = !!conv.self_destruct;
            });
        });

        this.version(4).stores({
            conversations: "&id, peer_id, peer_tag, updated_at",
            messages: "&id, conversation_id, timestamp, delete_at",
        }).upgrade(tx => {
            return tx.table("messages").toCollection().modify(msg => {
                // Keep existing status if it's sent/delivered/read
                // No fields directly mandatory to backfill for replies
            });
        });
    }
}

// ─── Singleton Export ─────────────────────────────────────────────────────────

/**
 * The single, shared Dexie database instance for the entire application.
 *
 * Import this wherever you need to read or write local chat data:
 *   import { db } from '@/lib/localDb';
 *
 *   // Write a message
 *   await db.messages.add({ id, conversation_id, sender_id, text, timestamp, status: 'delivered' });
 *
 *   // Live query in a component (with dexie-react-hooks)
 *   const messages = useLiveQuery(
 *     () => db.messages.where('conversation_id').equals(convId).sortBy('timestamp'),
 *     [convId]
 *   );
 */
export const db = new ChatAppDatabase();
