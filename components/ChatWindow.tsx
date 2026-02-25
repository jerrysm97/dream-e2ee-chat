/**
 * ChatWindow.tsx — Dream E2EE Chat
 *
 * Contact Discovery: users search by short tag (e.g. #AB3X7K)
 * instead of pasting raw UUIDs.
 */

"use client";

import React, {
    useState,
    useRef,
    useEffect,
    useCallback,
    FormEvent,
    KeyboardEvent as ReactKE,
} from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { createClient } from "@supabase/supabase-js";
import { db, Conversation, Message } from "../lib/localDb";
import {
    useChatQueue,
    sendMessage,
    sendDeleteSignal,
    sendTypingSignal,
    sendAckReadSignal,
    sendAckDeliveredSignal,
    sendSetDisappearingSignal,
    DecryptedMessage,
} from "../hooks/useChatQueue";
import { usePresence } from "../hooks/usePresence";

// ─── Supabase client ─────────────────────────────────────────────────────────
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ─── Types ────────────────────────────────────────────────────────────────────
interface ChatWindowProps {
    myUserId: string;
    onStartCall?: (targetUserId: string) => void;
    sendFile?: (file: File) => Promise<void>;
    transferProgress?: { sender: number; receiver: number };
}

interface SearchResult {
    id: string;
    user_tag: string;
    public_key: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const snippet = (t: string, n = 45) => (t.length > n ? t.slice(0, n) + "…" : t);
const fmtTime = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const fmtDay = (ts: number) => {
    const d = new Date(ts), today = new Date();
    if (d.toDateString() === today.toDateString()) return "Today";
    const y = new Date(today); y.setDate(today.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return "Yesterday";
    return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
};
const convId = (a: string, b: string) => [a, b].sort().join("__");

const urlRegex = /(https?:\/\/[^\s]+)/g;
async function fetchLinkPreview(text: string) {
    const match = text.match(urlRegex);
    if (!match) return null;
    try {
        const url = match[0];
        const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
        if (!res.ok) return null;
        const data = await res.json();
        const html = data.contents;

        const getMeta = (prop: string) => {
            const m = html.match(new RegExp(`<meta(?:\\s+[a-zA-Z0-9-]+="[^"]*")*\\s+(?:property|name)="${prop}"\\s+content="([^"]+)"`, "i")) ||
                html.match(new RegExp(`<meta(?:\\s+[a-zA-Z0-9-]+="[^"]*")*\\s+content="([^"]+)"\\s+(?:property|name)="${prop}"`, "i"));
            return m ? m[1] : null;
        };

        const title = getMeta("og:title") || getMeta("twitter:title") || html.match(/<title>([^<]+)<\/title>/i)?.[1];
        const description = getMeta("og:description") || getMeta("twitter:description") || getMeta("description");
        const image = getMeta("og:image") || getMeta("twitter:image");

        if (title || description || image) {
            return { url, title, description, image };
        }
    } catch (e) { console.error("Link preview error:", e); }
    return null;
}

// ─── Inline SVG Icons ────────────────────────────────────────────────────────
const SendIcon = () => (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
        <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
);
const VideoIcon = () => (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <polygon points="23 7 16 12 23 17 23 7" />
        <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
);
const TimerIcon = ({ active }: { active: boolean }) => (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke={active ? "#25D366" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
    </svg>
);
const SearchIcon = () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
);
const LockIcon = ({ size = 10 }: { size?: number }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
);
const CopyIcon = () => (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
);
const TrashIcon = () => (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 6h18" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <line x1="10" y1="11" x2="10" y2="17" />
        <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
);
const PaperclipIcon = () => (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
);
const ReplyIcon = () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 17 4 12 9 7" />
        <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
    </svg>
);
const ClockIcon = () => (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
    </svg>
);
const SettingsIcon = () => (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
);

// ─── Message Bubble ───────────────────────────────────────────────────────────
const MessageBubble = React.memo(({ message, isMine, onDelete, onReply }: { message: Message & { link_preview?: any }; isMine: boolean; onDelete: (id: string) => void; onReply: (msg: Message) => void }) => {

    const StatusIcon = () => {
        if (!isMine) return null;
        if (message.status === "sending") return <span className="bubble-tick sending"><ClockIcon /></span>;
        if (message.status === "sent") return <span className="bubble-tick">✓</span>;
        if (message.status === "delivered") return <span className="bubble-tick">✓✓</span>;
        return <span className="bubble-tick read">✓✓</span>;
    };

    return (
        <div className={`bubble-row ${isMine ? "sent" : "received"}`}>
            <div className={`bubble ${isMine ? "sent" : "received"}`}>

                {message.reply_snippet && (
                    <div className="bubble-reply-embed">
                        <div className="bubble-reply-bar" />
                        <span className="bubble-reply-text">{message.reply_snippet}</span>
                    </div>
                )}

                <p className="bubble-text">{message.text}</p>

                {message.link_preview && (
                    <a href={message.link_preview.url} target="_blank" rel="noopener noreferrer" className="bubble-link-preview">
                        {message.link_preview.image && <img src={message.link_preview.image} alt="Preview" />}
                        <div className="bubble-link-meta">
                            <strong>{snippet(message.link_preview.title || "Link", 40)}</strong>
                            <span>{snippet(message.link_preview.description || message.link_preview.url, 60)}</span>
                        </div>
                    </a>
                )}

                <div className="bubble-meta">
                    <button onClick={() => onReply(message)} className="bubble-reply-btn" aria-label="Reply">
                        <ReplyIcon />
                    </button>
                    {isMine && (
                        <button onClick={() => onDelete(message.id)} className="bubble-delete-btn" aria-label="Delete message remotely">
                            <TrashIcon />
                        </button>
                    )}
                    <span className="bubble-lock"><LockIcon size={9} /></span>
                    <span className="bubble-time">{fmtTime(message.timestamp)}</span>
                    <StatusIcon />
                </div>
            </div>
        </div>
    );
});
MessageBubble.displayName = "MessageBubble";

// ─── Main Component ───────────────────────────────────────────────────────────
const ChatWindow: React.FC<ChatWindowProps> = ({ myUserId, onStartCall, sendFile, transferProgress }) => {
    // Active conversation
    const [activeConvId, setActiveConvId] = useState<string | null>(null);
    const [activePeerId, setActivePeerId] = useState<string | null>(null);
    const [activePeerTag, setActivePeerTag] = useState<string>("");

    const [replyingTo, setReplyingTo] = useState<Message | null>(null);

    // My own tag (fetched once from Supabase)
    const [myTag, setMyTag] = useState<string>("");
    const [myDisplayName, setMyDisplayName] = useState<string>("");
    const [myAvatarUrl, setMyAvatarUrl] = useState<string>("");
    const [myTagCopied, setMyTagCopied] = useState(false);

    // Profile Settings Modal
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [displayNameInput, setDisplayNameInput] = useState("");
    const [avatarUrlInput, setAvatarUrlInput] = useState("");

    // Tag search
    const [tagQuery, setTagQuery] = useState("");
    const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
    const [searching, setSearching] = useState(false);
    const [searchMsg, setSearchMsg] = useState<string>("");
    const [showResults, setShowResults] = useState(false);

    // Chat
    const [inputText, setInputText] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [convSearch, setConvSearch] = useState("");

    // Real-time UX state
    const onlineUsers = usePresence(myUserId);
    const [typingPeers, setTypingPeers] = useState<Record<string, number>>({});
    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Refs
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const searchTimeout = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        supabase
            .from("profiles")
            .select("user_tag, display_name, avatar_url")
            .eq("id", myUserId)
            .single()
            .then(({ data }) => {
                if (data?.user_tag) setMyTag(data.user_tag);
                if (data?.display_name) {
                    setMyDisplayName(data.display_name);
                    setDisplayNameInput(data.display_name);
                }
                if (data?.avatar_url) {
                    setMyAvatarUrl(data.avatar_url);
                    setAvatarUrlInput(data.avatar_url);
                }
            });
    }, [myUserId]);

    // ── Save Profile Settings ──────────────────────────────────────────────────
    const handleSaveSettings = async (e: FormEvent) => {
        e.preventDefault();
        try {
            const { error } = await supabase
                .from("profiles")
                .update({ display_name: displayNameInput, avatar_url: avatarUrlInput })
                .eq("id", myUserId);

            if (error) throw error;
            setMyDisplayName(displayNameInput);
            setMyAvatarUrl(avatarUrlInput);
            setIsSettingsOpen(false);
        } catch (err: any) {
            alert(`Failed to save settings: ${err.message}`);
        }
    };

    // ── Dexie live queries ────────────────────────────────────────────────────
    const conversations = useLiveQuery(
        () => db.conversations.orderBy("updated_at").reverse().toArray(),
        [],
        [] as Conversation[]
    );
    const messages = useLiveQuery(
        () => activeConvId
            ? db.messages.where("conversation_id").equals(activeConvId).sortBy("timestamp")
            : Promise.resolve([] as Message[]),
        [activeConvId],
        [] as Message[]
    );

    // ── Auto-scroll ───────────────────────────────────────────────────────────
    useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
    useEffect(() => {
        if (activeConvId) setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "instant" }), 80);
    }, [activeConvId]);

    // ── Auto-resize textarea ──────────────────────────────────────────────────
    useEffect(() => {
        if (!textareaRef.current) return;
        textareaRef.current.style.height = "auto";
        textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }, [inputText]);

    const handleMessageDecrypted = useCallback(async (d: DecryptedMessage) => {
        const cid = convId(myUserId, d.senderId);
        const conv = await db.conversations.get(cid);
        // Retain self_destruct status
        const deleteAt = conv?.self_destruct ? Date.now() + 30000 : undefined;

        let parsedText = d.plainText;
        let reply_to_id, reply_snippet, link_preview;
        try {
            const payload = JSON.parse(d.plainText);
            if (payload.text !== undefined) {
                parsedText = payload.text;
                reply_to_id = payload.reply_to_id;
                reply_snippet = payload.reply_snippet;
                link_preview = payload.link_preview;
            }
        } catch (e) {
            // Fallback: older messages were just plain text
        }

        const msgRecord: Message & { link_preview?: any } = {
            id: d.id, conversation_id: cid, sender_id: d.senderId,
            text: parsedText, timestamp: new Date(d.receivedAt).getTime(), status: "delivered",
            delete_at: deleteAt,
            reply_to_id,
            reply_snippet,
            link_preview
        };

        await db.messages.put(msgRecord);
        await db.conversations.put({
            id: cid, peer_id: d.senderId, peer_public_key: d.senderPublicKeyBase64,
            last_message_snippet: snippet(parsedText), updated_at: Date.now(),
            self_destruct: conv?.self_destruct,
        });

        // Broadcast ACK_DELIVERED back to sender
        sendAckDeliveredSignal(d.id, d.senderId, myUserId).catch(() => console.error('Failed to ACK_DELIVERED'));
    }, [myUserId]);

    const handlePeerTyping = useCallback((peerId: string) => {
        setTypingPeers(prev => ({ ...prev, [peerId]: Date.now() }));
    }, []);

    const handleAckRead = useCallback(async (messageIds: string[], peerId: string) => {
        const cid = convId(myUserId, peerId);
        const conv = await db.conversations.get(cid);
        const deleteAt = conv?.self_destruct ? Date.now() + 30000 : undefined;

        await db.messages.where("id").anyOf(messageIds).modify(msg => {
            msg.status = "read";
            if (deleteAt && !msg.delete_at) msg.delete_at = deleteAt;
        });
    }, [myUserId]);

    const handleAckDelivered = useCallback(async (messageId: string, peerId: string) => {
        await db.messages.update(messageId, { status: "delivered" });
    }, []);

    const handleSetDisappearing = useCallback(async (enabled: boolean, peerId: string) => {
        const cid = convId(myUserId, peerId);
        await db.conversations.update(cid, { self_destruct: enabled });
    }, [myUserId]);

    useChatQueue(myUserId, handleMessageDecrypted, handlePeerTyping, handleAckRead, handleAckDelivered, handleSetDisappearing);

    // ── Local read receipt logic (ack incoming messages) ──────────────────────
    useEffect(() => {
        if (!messages || messages.length === 0 || !activePeerId || !activeConvId) return;

        const unreadIncoming = messages.filter(m => m.sender_id === activePeerId && m.status !== "read");
        if (unreadIncoming.length > 0) {
            const unreadIds = unreadIncoming.map(m => m.id);

            db.conversations.get(activeConvId).then(conv => {
                const deleteAt = conv?.self_destruct ? Date.now() + 30000 : undefined;

                db.messages.where("id").anyOf(unreadIds).modify(msg => {
                    msg.status = "read";
                    if (deleteAt && !msg.delete_at) msg.delete_at = deleteAt;
                }).then(() => {
                    sendAckReadSignal(unreadIds, activePeerId, myUserId);
                });
            });
        }
    }, [messages, activePeerId, activeConvId, myUserId]);

    // ── Clear typing statuses after 3s ────────────────────────────────────────
    useEffect(() => {
        const interval = setInterval(() => {
            const now = Date.now();
            setTypingPeers(prev => {
                const next = { ...prev };
                let changed = false;
                for (const [id, time] of Object.entries(next)) {
                    if (now - time > 3000) { delete next[id]; changed = true; }
                }
                return changed ? next : prev;
            });
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    // ── Master Disappearing Messages Timer ────────────────────────────────────
    useEffect(() => {
        const interval = setInterval(async () => {
            const now = Date.now();
            const expired = await db.messages.filter(m => !!m.delete_at && m.delete_at <= now).toArray();
            for (const msg of expired) {
                await db.messages.delete(msg.id);
                // Also tell the peer to delete it, just to be synchronized
                const peerId = msg.conversation_id.replace(myUserId, "").replace("__", "");
                await sendDeleteSignal(msg.id, peerId, myUserId);

                const conv = await db.conversations.get(msg.conversation_id);
                if (conv && conv.last_message_snippet === snippet(msg.text)) {
                    await db.conversations.update(conv.id, { last_message_snippet: "🚫 Message expired" });
                }
            }
        }, 2000);
        return () => clearInterval(interval);
    }, [myUserId]);

    // ── Local Database Garbage Collection ─────────────────────────────────────
    useEffect(() => {
        if (!activeConvId || messages.length <= 1000) return;

        const performGC = async () => {
            try {
                const count = await db.messages.where("conversation_id").equals(activeConvId).count();
                if (count > 1000) {
                    console.log(`[GC] Conversation ${activeConvId} has ${count} messages. Deleting oldest 500...`);
                    const oldMessages = await db.messages
                        .where("conversation_id").equals(activeConvId)
                        .sortBy("timestamp");

                    const toDelete = oldMessages.slice(0, 500).map(m => m.id);
                    await db.messages.bulkDelete(toDelete);
                    console.log(`[GC] Deleted 500 oldest messages for ${activeConvId}.`);
                }
            } catch (err) {
                console.error("[GC] Garbage collection failed:", err);
            }
        };

        performGC();
    }, [messages.length, activeConvId]);

    // ── Tag search (debounced) ────────────────────────────────────────────────
    const handleTagInput = useCallback((val: string) => {
        setTagQuery(val);
        setSearchMsg("");
        setSearchResults([]);

        if (searchTimeout.current) clearTimeout(searchTimeout.current);
        if (!val.trim()) { setShowResults(false); return; }

        setShowResults(true);
        setSearching(true);

        searchTimeout.current = setTimeout(async () => {
            // Normalise: make sure query starts with # for prefix match
            const q = val.trim().startsWith("#") ? val.trim() : `#${val.trim()}`;

            const { data, error } = await supabase
                .from("profiles")
                .select("id, user_tag, public_key")
                .ilike("user_tag", `${q}%`)      // prefix search
                .neq("id", myUserId)             // exclude self
                .limit(8);

            setSearching(false);
            if (error) { setSearchMsg("Search error — try again"); return; }
            if (!data || data.length === 0) {
                setSearchMsg(q.length >= 4 ? "No user found with that tag" : "Keep typing…");
                return;
            }
            setSearchResults(data as SearchResult[]);
        }, 300);
    }, [myUserId]);

    // ── Add contact from search result ────────────────────────────────────────
    const handleAddContact = useCallback(async (result: SearchResult) => {
        const cid = convId(myUserId, result.id);
        await db.conversations.put({
            id: cid,
            peer_id: result.id,
            peer_public_key: result.public_key ?? "",
            last_message_snippet: "",
            updated_at: Date.now(),
        });
        setActiveConvId(cid);
        setActivePeerId(result.id);
        setActivePeerTag(result.user_tag);
        setTagQuery("");
        setSearchResults([]);
        setShowResults(false);
    }, [myUserId]);

    // Click outside search → close dropdown
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
                setShowResults(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    // ── Send message ──────────────────────────────────────────────────────────
    const handleSend = useCallback(async () => {
        const text = inputText.trim();
        if (!text || !activePeerId || !activeConvId || isSending) return;
        setInputText(""); setIsSending(true);
        const localId = `local_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const now = Date.now();
        const conv = await db.conversations.get(activeConvId);
        const deleteAt = conv?.self_destruct ? now + 30000 : undefined; // Start timer immediately for our own messages

        // Zero-Knowledge Link Previews (fetched client-side, encrypted into payload)
        const link_preview = await fetchLinkPreview(text);

        const payloadObj = {
            text,
            reply_to_id: replyingTo?.id,
            reply_snippet: replyingTo ? snippet(replyingTo.text, 50) : undefined,
            link_preview
        };

        const msgRecord: Message & { link_preview?: any } = {
            id: localId, conversation_id: activeConvId, sender_id: myUserId,
            text, timestamp: now, status: "sending", delete_at: deleteAt,
            reply_to_id: payloadObj.reply_to_id,
            reply_snippet: payloadObj.reply_snippet,
            link_preview
        };

        await db.messages.put(msgRecord);
        await db.conversations.update(activeConvId, { peer_public_key: conv?.peer_public_key || "", last_message_snippet: snippet(text), updated_at: now });
        setReplyingTo(null);

        try {
            await sendMessage(activePeerId, JSON.stringify(payloadObj), myUserId);
            await db.messages.update(localId, { status: "sent" });
        } catch (e: any) {
            console.error("[ChatWindow] Send:", e);
            alert(e.message);
        } finally {
            setIsSending(false);
        }
    }, [inputText, activePeerId, activeConvId, myUserId, isSending, replyingTo]);

    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInputText(e.target.value);
        if (activePeerId && !typingTimeoutRef.current) {
            sendTypingSignal(activePeerId, myUserId).catch(() => { });
            typingTimeoutRef.current = setTimeout(() => { typingTimeoutRef.current = null; }, 2000);
        }
    };

    const handleKeyDown = (e: ReactKE<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
    };

    // ── Send File ─────────────────────────────────────────────────────────────
    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !sendFile) return;
        try {
            await sendFile(file);
        } catch (error: any) {
            console.error("[ChatWindow] Send File:", error);
            alert(`File transfer failed: ${error.message}`);
        }
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    // ── Delete Message Remote ─────────────────────────────────────────────────
    const handleDeleteMessage = useCallback(async (msgId: string) => {
        if (!activePeerId) return;

        try {
            // 1. Send signal (fire and forget)
            await sendDeleteSignal(msgId, activePeerId, myUserId);

            // 2. Delete locally
            const msg = await db.messages.get(msgId);
            if (msg) {
                await db.messages.delete(msgId);

                // 3. Update conversation snippet if it was the last message
                const conv = await db.conversations.get(msg.conversation_id);
                if (conv && conv.last_message_snippet === snippet(msg.text)) {
                    await db.conversations.update(conv.id, {
                        last_message_snippet: "🚫 Message deleted"
                    });
                }
            }
        } catch (e) {
            console.error("[ChatWindow] Failed to delete message:", e);
        }
    }, [activePeerId, myUserId]);

    // ── Toggle Disappearing Messages ──────────────────────────────────────────
    const handleToggleDisappearing = useCallback(async () => {
        if (!activeConvId || !activePeerId) return;
        const conv = await db.conversations.get(activeConvId);
        const newState = !conv?.self_destruct;
        await db.conversations.update(activeConvId, { self_destruct: newState });
        sendSetDisappearingSignal(newState, activePeerId, myUserId).catch(() => { });
    }, [activeConvId, activePeerId, myUserId]);

    // ── Copy my tag ───────────────────────────────────────────────────────────
    const handleCopyMyTag = useCallback(() => {
        const toCopy = myTag || myUserId;
        navigator.clipboard.writeText(toCopy).then(() => {
            setMyTagCopied(true);
            setTimeout(() => setMyTagCopied(false), 2000);
        });
    }, [myTag, myUserId]);

    // ── Open existing conversation ────────────────────────────────────────────
    const openConv = useCallback((conv: Conversation) => {
        setActiveConvId(conv.id);
        setActivePeerId(conv.peer_id);
        setActivePeerTag(conv.peer_tag ?? conv.peer_id.slice(0, 10));
    }, []);

    // ── Filtered conversations ────────────────────────────────────────────────
    const filteredConvs = (conversations ?? []).filter(c =>
        !convSearch || (c.peer_tag ?? c.peer_id).toLowerCase().includes(convSearch.toLowerCase())
    );

    // ── Render messages with day separators ──────────────────────────────────
    const renderMessages = () => {
        if (!messages || messages.length === 0) {
            return (
                <div className="chat-empty-notice">
                    <div className="chat-empty-pill">🔒 Messages on this device are end-to-end encrypted</div>
                </div>
            );
        }
        const items: React.ReactNode[] = [];
        let lastDay = "";
        messages.forEach(msg => {
            const day = fmtDay(msg.timestamp);
            if (day !== lastDay) {
                items.push(<div key={`d-${msg.timestamp}`} className="day-sep"><span className="day-sep-pill">{day}</span></div>);
                lastDay = day;
            }
            items.push(<MessageBubble key={msg.id} message={msg as Message & { link_preview?: any }} isMine={msg.sender_id === myUserId} onDelete={handleDeleteMessage} onReply={setReplyingTo} />);
        });
        return items;
    };

    // ─── Render ───────────────────────────────────────────────────────────────
    return (
        <div className="app-shell">

            {/* ══════════════════════════════════════
                SIDEBAR
                ══════════════════════════════════════ */}
            <aside className="sidebar">

                {/* Header */}
                <div className="sidebar-header">
                    <div className="sidebar-avatar">
                        {myAvatarUrl ? (
                            <img src={myAvatarUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                            myTag.slice(1, 3) || myUserId.slice(0, 2).toUpperCase()
                        )}
                    </div>
                    <div>
                        <div className="sidebar-app-name">{myDisplayName || "Dream"}</div>
                        <div className="sidebar-tagline">E2EE Messenger</div>
                    </div>
                    <div className="sidebar-secure-badge">🔒 Secure</div>
                </div>

                {/* Conversation Search */}
                <div className="sidebar-search-wrap">
                    <div className="sidebar-search-inner">
                        <span className="sidebar-search-icon"><SearchIcon /></span>
                        <input
                            className="sidebar-search"
                            type="text"
                            placeholder="Search chats…"
                            value={convSearch}
                            onChange={e => setConvSearch(e.target.value)}
                        />
                    </div>
                </div>

                {/* ── Tag Search / Add Contact ───────────────────────────── */}
                <div className="add-peer-section" style={{ position: "relative" }} ref={searchRef as any}>
                    <div className="add-peer-label">Add contact by tag</div>
                    <div style={{ position: "relative" }}>
                        <input
                            id="tag-search-input"
                            className="add-peer-input"
                            style={{ width: "100%", paddingLeft: "2rem" }}
                            type="text"
                            placeholder="#ABC123 — search by tag…"
                            value={tagQuery}
                            onChange={e => handleTagInput(e.target.value)}
                            autoComplete="off"
                        />
                        {/* Search icon inside input */}
                        <span style={{
                            position: "absolute", left: "0.625rem", top: "50%", transform: "translateY(-50%)",
                            color: "rgba(255,255,255,0.3)", pointerEvents: "none"
                        }}>
                            <SearchIcon />
                        </span>

                        {/* Dropdown result */}
                        {showResults && (
                            <div style={{
                                position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0,
                                background: "#1e2435", border: "1px solid rgba(255,255,255,0.1)",
                                borderRadius: "12px", overflow: "hidden", zIndex: 50,
                                boxShadow: "0 8px 24px rgba(0,0,0,0.5)"
                            }}>
                                {searching && (
                                    <div style={{ padding: "0.75rem 1rem", color: "rgba(255,255,255,0.4)", fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                        <div style={{ width: 12, height: 12, border: "2px solid rgba(255,255,255,0.2)", borderTopColor: "#25D366", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                                        Searching…
                                    </div>
                                )}
                                {!searching && searchMsg && (
                                    <div style={{ padding: "0.75rem 1rem", color: "rgba(255,255,255,0.35)", fontSize: "0.75rem" }}>{searchMsg}</div>
                                )}
                                {!searching && searchResults.map(r => (
                                    <button
                                        key={r.id}
                                        onClick={() => handleAddContact(r)}
                                        style={{
                                            display: "flex", alignItems: "center", gap: "0.75rem",
                                            width: "100%", padding: "0.625rem 0.875rem",
                                            background: "none", border: "none", cursor: "pointer",
                                            borderBottom: "1px solid rgba(255,255,255,0.04)",
                                            transition: "background 0.1s"
                                        }}
                                        onMouseEnter={e => (e.currentTarget.style.background = "rgba(37,211,102,0.08)")}
                                        onMouseLeave={e => (e.currentTarget.style.background = "none")}
                                    >
                                        {/* Avatar */}
                                        <div style={{
                                            width: 34, height: 34, borderRadius: "50%",
                                            background: "linear-gradient(135deg,#25D366,#128C7E)",
                                            display: "flex", alignItems: "center", justifyContent: "center",
                                            color: "#fff", fontWeight: 700, fontSize: "0.75rem", flexShrink: 0
                                        }}>
                                            {r.user_tag.slice(1, 3)}
                                        </div>
                                        <div style={{ flex: 1, textAlign: "left" }}>
                                            <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "#e5e7eb" }}>{r.user_tag}</div>
                                            <div style={{ fontSize: "0.65rem", color: "rgba(37,211,102,0.7)", marginTop: 2 }}>
                                                {r.public_key ? "🔒 E2EE key ready" : "⚠ Key not set up yet"}
                                            </div>
                                        </div>
                                        <div style={{
                                            padding: "3px 10px", background: "rgba(37,211,102,0.12)",
                                            border: "1px solid rgba(37,211,102,0.25)", borderRadius: "999px",
                                            fontSize: "0.65rem", color: "#25D366", fontWeight: 600
                                        }}>
                                            Add
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Conversation List */}
                <div className="conv-list">
                    {filteredConvs.length === 0 ? (
                        <div className="conv-empty">
                            <div className="conv-empty-icon">💬</div>
                            <div className="conv-empty-title">No conversations</div>
                            <div className="conv-empty-sub">Search a tag above to get started</div>
                        </div>
                    ) : (
                        filteredConvs.map(conv => (
                            <button
                                key={conv.id}
                                className={`conv-item ${conv.id === activeConvId ? "active" : ""}`}
                                onClick={() => openConv(conv)}
                            >
                                <div className="conv-avatar">
                                    {(conv.peer_tag ?? conv.peer_id).slice(1, 3).toUpperCase()}
                                </div>
                                <div className="conv-meta">
                                    <div className="conv-meta-row">
                                        <span className="conv-name">
                                            {conv.peer_tag ?? conv.peer_id.slice(0, 12) + "…"}
                                            {onlineUsers.has(conv.peer_id) && <span style={{ display: 'inline-block', width: 8, height: 8, background: '#25D366', borderRadius: '50%', marginLeft: 6, verticalAlign: 'middle' }} />}
                                        </span>
                                        <span className="conv-time">{fmtTime(conv.updated_at)}</span>
                                    </div>
                                    <div className="conv-snippet">
                                        {typingPeers[conv.peer_id] ? <span style={{ color: '#25D366', fontStyle: 'italic' }}>Typing…</span> : (conv.last_message_snippet || "No messages yet")}
                                    </div>
                                </div>
                            </button>
                        ))
                    )}
                </div>

                {/* My Profile Footer */}
                <div className="sidebar-footer">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                        <div className="sidebar-footer-label">My Tag (share this to be found)</div>
                        <button onClick={() => setIsSettingsOpen(true)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", padding: "4px" }} aria-label="Settings">
                            <SettingsIcon />
                        </button>
                    </div>
                    <button className="sidebar-my-id" onClick={handleCopyMyTag} aria-label="Copy my tag">
                        <span style={{ fontSize: "1rem", fontWeight: 700, color: "#25D366", letterSpacing: "0.08em" }}>
                            {myTag || "Loading…"}
                        </span>
                        <span className="sidebar-copy-icon"><CopyIcon /></span>
                    </button>
                    <div className="sidebar-copy-hint">
                        {myTagCopied ? "✓ Copied to clipboard!" : "Tap to copy • Share with contacts"}
                    </div>
                </div>
            </aside>

            {/* ══════════════════════════════════════
                MAIN CHAT AREA
                ══════════════════════════════════════ */}
            <main className="chat-main">
                {activeConvId && activePeerId ? (
                    <>
                        <header className="chat-header">
                            <div className="chat-header-avatar">
                                {activePeerTag.slice(1, 3).toUpperCase() || activePeerId.slice(0, 2).toUpperCase()}
                            </div>
                            <div className="chat-header-meta">
                                <div className="chat-header-name">
                                    {activePeerTag || activePeerId}
                                </div>
                                <div className="chat-header-e2ee">
                                    {typingPeers[activePeerId] ? (
                                        <span style={{ color: "#25D366", fontStyle: "italic", fontSize: "0.8rem" }}>Typing…</span>
                                    ) : (
                                        <>
                                            <div className="chat-header-e2ee-dot" />
                                            <span className="chat-header-e2ee-text">End-to-end encrypted</span>
                                        </>
                                    )}
                                </div>
                            </div>

                            <div style={{ display: "flex", gap: "10px" }}>
                                <button className="chat-call-btn"
                                    onClick={handleToggleDisappearing}
                                    aria-label="Toggle disappearing messages"
                                    title="Disappearing messages (30s after read)">
                                    <TimerIcon active={!!conversations?.find(c => c.id === activeConvId)?.self_destruct} />
                                </button>
                                {onStartCall && (
                                    <button className="chat-call-btn" id="start-video-call-btn"
                                        onClick={() => onStartCall(activePeerId)} aria-label="Start video call">
                                        <VideoIcon />
                                    </button>
                                )}
                            </div>
                        </header>

                        <div className="chat-messages">
                            <div className="chat-messages-inner">
                                {renderMessages()}
                                <div ref={messagesEndRef} />
                            </div>
                        </div>

                        {/* File Transfer Progress */}
                        {transferProgress && (transferProgress.sender > 0 || transferProgress.receiver > 0) && (
                            <div style={{
                                padding: "6px 16px",
                                background: "rgba(0,0,0,0.4)",
                                borderBottom: "1px solid rgba(255,255,255,0.05)",
                                display: "flex", flexDirection: "column", gap: 4
                            }}>
                                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "rgba(255,255,255,0.7)" }}>
                                    <span>{transferProgress.sender > 0 ? "Sending file…" : "Receiving file…"}</span>
                                    <span>{Math.max(transferProgress.sender, transferProgress.receiver)}%</span>
                                </div>
                                <div style={{ width: "100%", height: 3, background: "rgba(255,255,255,0.1)", borderRadius: 4, overflow: "hidden" }}>
                                    <div style={{
                                        width: `${Math.max(transferProgress.sender, transferProgress.receiver)}%`,
                                        height: "100%", background: "#25D366", transition: "width 0.2s linear"
                                    }} />
                                </div>
                            </div>
                        )}

                        <footer className="chat-input-bar">

                            {/* Reply Banner */}
                            {replyingTo && (
                                <div style={{
                                    position: "absolute", bottom: "100%", left: 0, right: 0,
                                    background: "#1e2435", borderTop: "1px solid rgba(255,255,255,0.05)",
                                    padding: "8px 16px", display: "flex", alignItems: "center", gap: "10px",
                                    borderLeft: "4px solid #25D366"
                                }}>
                                    <div style={{ flex: 1, fontSize: "0.8rem", color: "rgba(255,255,255,0.6)" }}>
                                        <div style={{ color: "#25D366", fontWeight: "bold", marginBottom: "2px" }}>Replying to</div>
                                        <div>{snippet(replyingTo.text, 60)}</div>
                                    </div>
                                    <button onClick={() => setReplyingTo(null)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", padding: "4px" }}>
                                        ✕
                                    </button>
                                </div>
                            )}

                            <button
                                className="chat-attach-btn"
                                onClick={() => fileInputRef.current?.click()}
                                aria-label="Attach file"
                                style={{
                                    background: "none", border: "none", color: "rgba(255,255,255,0.5)",
                                    cursor: "pointer", padding: "8px", display: "flex", alignItems: "center"
                                }}
                            >
                                <PaperclipIcon />
                            </button>
                            <input
                                type="file"
                                ref={fileInputRef}
                                style={{ display: 'none' }}
                                onChange={handleFileSelect}
                            />
                            <div className="chat-input-wrap">
                                <textarea
                                    id="message-input"
                                    ref={textareaRef}
                                    className="chat-input"
                                    rows={1}
                                    placeholder="Type a message…"
                                    value={inputText}
                                    onChange={handleInputChange}
                                    onKeyDown={handleKeyDown}
                                    disabled={isSending}
                                />
                            </div>
                            <button id="send-message-btn" className="send-btn"
                                onClick={handleSend} disabled={!inputText.trim() || isSending} aria-label="Send message">
                                {isSending
                                    ? <div style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                                    : <SendIcon />}
                            </button>
                        </footer>
                    </>
                ) : (
                    <div className="chat-empty-state">
                        <div className="chat-empty-inner">
                            <div className="chat-empty-illus">🔐</div>
                            <div className="chat-empty-title">Dream — Secure Chat</div>
                            <div className="chat-empty-body">
                                Search a contact by their tag (e.g. <strong style={{ color: "#25D366" }}>#AB3X7K</strong>) in the sidebar to start a private conversation.
                            </div>
                            <div className="chat-empty-tag">
                                <LockIcon size={11} />
                                Curve25519 · XSalsa20-Poly1305 · E2EE
                            </div>
                        </div>
                    </div>
                )}
            </main>

            {/* ══════════════════════════════════════
                SETTINGS MODAL
                ══════════════════════════════════════ */}
            {isSettingsOpen && (
                <div style={{
                    position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 1000,
                    display: "flex", alignItems: "center", justifyContent: "center"
                }}>
                    <div style={{
                        background: "#1e2435", width: "90%", maxWidth: "400px", borderRadius: "16px",
                        padding: "24px", border: "1px solid rgba(255,255,255,0.1)",
                        boxShadow: "0 20px 40px rgba(0,0,0,0.5)"
                    }}>
                        <h2 style={{ fontSize: "1.2rem", fontWeight: 600, color: "#fff", marginBottom: "20px" }}>Profile Settings</h2>
                        <form onSubmit={handleSaveSettings} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                            <div>
                                <label style={{ display: "block", fontSize: "0.8rem", color: "rgba(255,255,255,0.6)", marginBottom: "8px" }}>Display Name</label>
                                <input
                                    type="text"
                                    value={displayNameInput}
                                    onChange={e => setDisplayNameInput(e.target.value)}
                                    placeholder="e.g. Satoshi Nakamoto"
                                    style={{
                                        width: "100%", padding: "12px", borderRadius: "8px",
                                        background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.1)",
                                        color: "#fff", fontSize: "1rem"
                                    }}
                                />
                            </div>
                            <div>
                                <label style={{ display: "block", fontSize: "0.8rem", color: "rgba(255,255,255,0.6)", marginBottom: "8px" }}>Avatar URL</label>
                                <input
                                    type="url"
                                    value={avatarUrlInput}
                                    onChange={e => setAvatarUrlInput(e.target.value)}
                                    placeholder="https://example.com/avatar.png"
                                    style={{
                                        width: "100%", padding: "12px", borderRadius: "8px",
                                        background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.1)",
                                        color: "#fff", fontSize: "1rem"
                                    }}
                                />
                            </div>
                            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "8px" }}>
                                <button
                                    type="button"
                                    onClick={() => setIsSettingsOpen(false)}
                                    style={{
                                        padding: "10px 16px", background: "none", border: "none",
                                        color: "rgba(255,255,255,0.6)", cursor: "pointer", fontWeight: 600
                                    }}>
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    style={{
                                        padding: "10px 20px", background: "#25D366", border: "none",
                                        color: "#000", cursor: "pointer", fontWeight: 700, borderRadius: "8px"
                                    }}>
                                    Save
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ChatWindow;
