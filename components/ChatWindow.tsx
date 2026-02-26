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
import { motion, AnimatePresence } from "framer-motion";
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
import { clearKeyStore } from "../lib/crypto/keyStore";
import { Check, Loader2, Settings, Gamepad2 } from "lucide-react";
import TicTacToeWidget from "./TicTacToeWidget";
import type { GameMovePayload } from "../hooks/useWebRTC";
import CodeSnippet from "./chat/CodeSnippet";

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
    isStealth: boolean;
    setIsStealth: (v: boolean) => void;
    onSignOut: () => Promise<void>;
    sendGameMove: (index: number, player: 'X' | 'O') => void;
    setOnGameMove: (cb: ((move: GameMovePayload) => void) | null) => void;
}

interface SearchResult {
    id: string;
    user_tag: string;
    display_name: string | null;
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

const renderTextWithSnippets = (text: string) => {
    if (!text) return null;
    const parts = text.split(/(```[\w]*\n[\s\S]*?```)/g);

    return parts.map((part, index) => {
        if (part.startsWith("```") && part.endsWith("```")) {
            const firstLineBreak = part.indexOf("\n");
            let language = "";
            let codeContent = part.slice(3, -3);

            if (firstLineBreak !== -1 && firstLineBreak < 20) {
                const potentialLang = part.slice(3, firstLineBreak).trim();
                if (!potentialLang.includes(" ") && potentialLang.length > 0) {
                    language = potentialLang;
                    codeContent = part.slice(firstLineBreak + 1, -3);
                }
            }

            if (codeContent.endsWith("\n")) {
                codeContent = codeContent.slice(0, -1);
            }

            return <CodeSnippet key={index} code={codeContent} language={language} />;
        }

        return part ? <span key={index}>{part}</span> : null;
    });
};

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

                <div className="bubble-text whitespace-pre-wrap">{renderTextWithSnippets(message.text)}</div>

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
const ChatWindow: React.FC<ChatWindowProps> = ({ myUserId, onStartCall, sendFile, transferProgress, isStealth, setIsStealth, onSignOut, sendGameMove, setOnGameMove }) => {
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
    const [tagInput, setTagInput] = useState("");
    const [isCheckingTag, setIsCheckingTag] = useState(false);
    const [tagAvailable, setTagAvailable] = useState<boolean | null>(null);
    const [tagMessage, setTagMessage] = useState("");
    const [settingsToast, setSettingsToast] = useState("");
    const [showNukeConfirm, setShowNukeConfirm] = useState(false);

    // Game state
    const [isGameOpen, setIsGameOpen] = useState(false);

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

    // Fetch my tag, display name, avatar
    useEffect(() => {
        if (!myUserId) return;
        supabase.from("profiles").select("user_tag, display_name, avatar_url").eq("id", myUserId).single()
            .then(({ data }) => {
                if (data?.user_tag) {
                    setMyTag(data.user_tag);
                    setTagInput(data.user_tag);
                }
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

    // Advanced Settings Modal Handlers
    const handleTagChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.toUpperCase();
        setTagInput(val);
        setTagAvailable(null);
        setTagMessage("");

        if (!val.startsWith("#") || val.length !== 7) {
            setTagMessage("Tag must be 7 characters starting with #");
            return;
        }
        if (val === myTag) {
            setTagAvailable(true);
            return;
        }

        setIsCheckingTag(true);
        const { data } = await supabase.from("profiles").select("id").eq("user_tag", val).single();
        setIsCheckingTag(false);
        if (data) {
            setTagAvailable(false);
            setTagMessage("Tag is already taken");
        } else {
            setTagAvailable(true);
            setTagMessage("Tag is available!");
        }
    };

    const handleSaveSettings = async (e: FormEvent) => {
        e.preventDefault();
        const updates: any = { display_name: displayNameInput, avatar_url: avatarUrlInput };
        if (tagInput && tagInput !== myTag && tagAvailable) {
            updates.user_tag = tagInput;
        }
        const { error } = await supabase.from("profiles").update(updates).eq("id", myUserId);
        if (error) {
            alert(`Error: ${error.message}`);
        } else {
            setMyDisplayName(displayNameInput);
            setMyAvatarUrl(avatarUrlInput);
            if (updates.user_tag) setMyTag(updates.user_tag);

            // Persist stealth mode
            localStorage.setItem("dream_stealth", isStealth ? "true" : "false");

            setSettingsToast("Settings saved successfully");
            setTimeout(() => {
                setSettingsToast("");
                setIsSettingsOpen(false);
            }, 1500);
        }
    };

    const handleNukeDevice = async () => {
        if (!confirm("Are you entirely sure you want to PERMANENTLY delete all local messages, conversations, and your encryption key from this device? You will not be able to read existing encrypted messages again.")) {
            setShowNukeConfirm(false);
            return;
        }

        try {
            await db.delete();
            await clearKeyStore();
            await onSignOut();
        } catch (e) {
            console.error("Failed to nuke device:", e);
            alert("An error occurred wiping the device");
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
            const q = val.trim();
            const isTagSearch = q.startsWith("#");

            let query = supabase
                .from("profiles")
                .select("id, user_tag, display_name, public_key")
                .neq("id", myUserId)
                .limit(8);

            if (isTagSearch) {
                query = query.ilike("user_tag", `${q}%`);
            } else {
                // Search by display_name OR tag
                query = query.or(`display_name.ilike.%${q}%,user_tag.ilike.%${q}%`);
            }

            const { data, error } = await query;

            setSearching(false);
            if (error) { setSearchMsg("Search error — try again"); return; }
            if (!data || data.length === 0) {
                setSearchMsg(q.length >= 2 ? "No user found" : "Keep typing…");
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
                    <div className="add-peer-label">Find people by name or tag</div>
                    <div style={{ position: "relative" }}>
                        <input
                            id="tag-search-input"
                            className="add-peer-input"
                            style={{ width: "100%", paddingLeft: "2rem" }}
                            type="text"
                            placeholder="Search by name or #tag…"
                            value={tagQuery}
                            onChange={e => handleTagInput(e.target.value)}
                            autoComplete="off"
                        />
                        {/* Search icon inside input */}
                        <span style={{
                            position: "absolute", left: "0.625rem", top: "50%", transform: "translateY(-50%)",
                            color: "#B0A0A0", pointerEvents: "none"
                        }}>
                            <SearchIcon />
                        </span>

                        {/* Dropdown result */}
                        {showResults && (
                            <div style={{
                                position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0,
                                background: "#1A0505", border: "1px solid rgba(201,168,76,0.12)",
                                borderRadius: "12px", overflow: "hidden", zIndex: 50,
                                boxShadow: "0 8px 24px rgba(0,0,0,0.1)"
                            }}>
                                {searching && (
                                    <div style={{ padding: "0.75rem 1rem", color: "#A89880", fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                        <div style={{ width: 12, height: 12, border: "2px solid #A89880", borderTopColor: "#C9A84C", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                                        Searching…
                                    </div>
                                )}
                                {!searching && searchMsg && (
                                    <div style={{ padding: "0.75rem 1rem", color: "#A89880", fontSize: "0.75rem" }}>{searchMsg}</div>
                                )}
                                {!searching && searchResults.map(r => (
                                    <button
                                        key={r.id}
                                        onClick={() => handleAddContact(r)}
                                        style={{
                                            display: "flex", alignItems: "center", gap: "0.75rem",
                                            width: "100%", padding: "0.625rem 0.875rem",
                                            background: "none", border: "none", cursor: "pointer",
                                            borderBottom: "1px solid #F0E6E8",
                                            transition: "background 0.1s"
                                        }}
                                        onMouseEnter={e => (e.currentTarget.style.background = "rgba(139,26,43,0.05)")}
                                        onMouseLeave={e => (e.currentTarget.style.background = "none")}
                                    >
                                        {/* Avatar */}
                                        <div style={{
                                            width: 34, height: 34, borderRadius: "50%",
                                            background: "#6B1A1A",
                                            display: "flex", alignItems: "center", justifyContent: "center",
                                            color: "#fff", fontWeight: 700, fontSize: "0.75rem", flexShrink: 0
                                        }}>
                                            {r.user_tag.slice(1, 3)}
                                        </div>
                                        <div style={{ flex: 1, textAlign: "left" }}>
                                            <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "#F5F0E8" }}>
                                                {r.display_name || r.user_tag}
                                            </div>
                                            <div style={{ fontSize: "0.65rem", color: "#A89880", marginTop: 2 }}>
                                                {r.display_name ? r.user_tag + " · " : ""}
                                                {r.public_key ? "🔒 E2EE ready" : "⚠ Key not set"}
                                            </div>
                                        </div>
                                        <div style={{
                                            padding: "3px 10px", background: "rgba(139,26,43,0.08)",
                                            border: "1px solid rgba(139,26,43,0.2)", borderRadius: "999px",
                                            fontSize: "0.65rem", color: "#C9A84C", fontWeight: 600
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
                                            {onlineUsers.has(conv.peer_id) && <span style={{ display: 'inline-block', width: 8, height: 8, background: '#16A34A', borderRadius: '50%', marginLeft: 6, verticalAlign: 'middle' }} />}
                                        </span>
                                        <span className="conv-time">{fmtTime(conv.updated_at)}</span>
                                    </div>
                                    <div className="conv-snippet">
                                        {typingPeers[conv.peer_id] ? <span style={{ color: '#C9A84C', fontStyle: 'italic' }}>Typing…</span> : (conv.last_message_snippet || "No messages yet")}
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
                        <span style={{ fontSize: "1rem", fontWeight: 700, color: "#C9A84C", letterSpacing: "0.08em", fontFamily: "'Cinzel', serif" }}>
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
                                        <span style={{ color: "#C9A84C", fontStyle: "italic", fontSize: "0.8rem" }}>Typing…</span>
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
                                <button
                                    className="chat-call-btn"
                                    onClick={() => setIsGameOpen(true)}
                                    aria-label="Play Tic-Tac-Toe"
                                    title="Play Tic-Tac-Toe"
                                >
                                    <Gamepad2 size={16} />
                                </button>
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
                                background: "#130304",
                                borderBottom: "1px solid rgba(201,168,76,0.12)",
                                display: "flex", flexDirection: "column", gap: 4
                            }}>
                                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "#A89880" }}>
                                    <span>{transferProgress.sender > 0 ? "Sending file…" : "Receiving file…"}</span>
                                    <span>{Math.max(transferProgress.sender, transferProgress.receiver)}%</span>
                                </div>
                                <div style={{ width: "100%", height: 3, background: "rgba(201,168,76,0.15)", borderRadius: 2, overflow: "hidden" }}>
                                    <div style={{
                                        width: `${Math.max(transferProgress.sender, transferProgress.receiver)}%`,
                                        height: "100%", background: "#C9A84C", transition: "width 0.2s linear"
                                    }} />
                                </div>
                            </div>
                        )}

                        <footer className="chat-input-bar">

                            {/* Reply Banner */}
                            {replyingTo && (
                                <div style={{
                                    position: "absolute", bottom: "100%", left: 0, right: 0,
                                    background: "#130304", borderTop: "1px solid rgba(201,168,76,0.12)",
                                    padding: "8px 16px", display: "flex", alignItems: "center", gap: "10px",
                                    borderLeft: "4px solid #C9A84C"
                                }}>
                                    <div style={{ flex: 1, fontSize: "0.8rem", color: "#A89880" }}>
                                        <div style={{ color: "#C9A84C", fontWeight: "bold", marginBottom: "2px" }}>Replying to</div>
                                        <div>{snippet(replyingTo.text, 60)}</div>
                                    </div>
                                    <button onClick={() => setReplyingTo(null)} style={{ background: "none", border: "none", color: "#A89880", cursor: "pointer", padding: "4px" }}>
                                        ✕
                                    </button>
                                </div>
                            )}

                            <button
                                className="chat-attach-btn"
                                onClick={() => fileInputRef.current?.click()}
                                aria-label="Attach file"
                                style={{
                                    background: "none", border: "none", color: "#A89880",
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
                                    ? <div style={{ width: 16, height: 16, border: "2px solid rgba(139,26,43,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
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
                                Search a contact by their tag (e.g. <strong style={{ color: "#C9A84C" }}>#AB3X7K</strong>) in the sidebar to start a private conversation.
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
            {/* ══════════════════════════════════════
                ADVANCED SETTINGS MODAL
                ══════════════════════════════════════ */}
            <AnimatePresence>
                {isSettingsOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
                        style={{ background: 'rgba(13, 0, 0, 0.92)' }}
                    >
                        <motion.div
                            initial={{ scale: 0.97, y: -8, opacity: 0 }}
                            animate={{ scale: 1, y: 0, opacity: 1 }}
                            exit={{ scale: 0.97, y: -8, opacity: 0 }}
                            className="bg-zk-surface w-full max-w-md border border-[rgba(201,168,76,0.35)] shadow-zk-panel overflow-hidden"
                            style={{ borderRadius: '4px' }}
                        >
                            <div className="p-6 border-b border-[rgba(201,168,76,0.12)] flex justify-between items-center">
                                <h2 className="text-xl font-display font-bold text-zk-ivory flex items-center gap-2">
                                    <Settings size={20} className="text-zk-gold" />
                                    Settings
                                </h2>
                                <button
                                    onClick={() => setIsSettingsOpen(false)}
                                    className="text-zk-ash hover:text-zk-ivory transition-colors"
                                >
                                    ✕
                                </button>
                            </div>

                            <div className="p-6 max-h-[70vh] overflow-y-auto overflow-x-hidden">
                                <form id="settings-form" onSubmit={handleSaveSettings} className="flex flex-col gap-6">

                                    {/* Profile Section */}
                                    <div className="space-y-4">
                                        <h3 className="text-sm font-mono font-semibold text-zk-gold uppercase tracking-wider">Profile</h3>

                                        <div>
                                            <label className="block text-xs text-zk-ash mb-1.5 ml-1 font-mono">Display Name</label>
                                            <input
                                                type="text"
                                                value={displayNameInput}
                                                onChange={e => setDisplayNameInput(e.target.value)}
                                                placeholder="e.g. Satoshi Nakamoto"
                                                className="w-full bg-zk-deep border border-[rgba(201,168,76,0.12)] px-4 py-3 text-zk-ivory placeholder:text-zk-ember focus:outline-none focus:border-[rgba(201,168,76,0.35)] transition-all font-body"
                                                style={{ borderRadius: '4px' }}
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-xs text-zk-ash mb-1.5 ml-1 font-mono">Avatar URL</label>
                                            <input
                                                type="url"
                                                value={avatarUrlInput}
                                                onChange={e => setAvatarUrlInput(e.target.value)}
                                                placeholder="https://example.com/avatar.png"
                                                className="w-full bg-zk-deep border border-[rgba(201,168,76,0.12)] px-4 py-3 text-zk-ivory placeholder:text-zk-ember focus:outline-none focus:border-[rgba(201,168,76,0.35)] transition-all font-body"
                                                style={{ borderRadius: '4px' }}
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-xs text-zk-ash mb-1.5 ml-1 font-mono">Custom User Tag</label>
                                            <div className="relative">
                                                <input
                                                    type="text"
                                                    value={tagInput}
                                                    onChange={handleTagChange}
                                                    placeholder="#XXXXXX"
                                                    maxLength={7}
                                                    className={`w-full bg-zk-deep border ${tagAvailable === false ? 'border-zk-crimson' : tagAvailable === true ? 'border-zk-gold' : 'border-[rgba(201,168,76,0.12)]'} px-4 py-3 text-zk-ivory placeholder:text-zk-ember focus:outline-none transition-all font-mono`}
                                                    style={{ borderRadius: '4px' }}
                                                />
                                                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                                    {isCheckingTag && <Loader2 size={16} className="text-zk-ash animate-spin" />}
                                                    {!isCheckingTag && tagAvailable === true && tagInput !== myTag && <Check size={16} className="text-zk-gold" />}
                                                </div>
                                            </div>
                                            {tagMessage && (
                                                <p className={`text-xs mt-1.5 ml-1 font-mono ${tagAvailable === false ? 'text-zk-crimson' : tagAvailable === true ? 'text-zk-gold' : 'text-zk-ash'}`}>
                                                    {tagMessage}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="h-px bg-[rgba(201,168,76,0.12)] w-full my-2" />

                                    {/* Privacy Section */}
                                    <div className="space-y-4">
                                        <h3 className="text-sm font-mono font-semibold text-zk-gold uppercase tracking-wider">Privacy</h3>

                                        <div className="flex items-center justify-between p-4 bg-zk-deep border border-[rgba(201,168,76,0.12)]" style={{ borderRadius: '4px' }}>
                                            <div>
                                                <div className="font-medium text-zk-ivory text-sm font-body">Stealth Mode</div>
                                                <div className="text-xs text-zk-ash mt-1 font-mono">Hide from 'Active Now' completely</div>
                                            </div>
                                            <label className="relative inline-flex items-center cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    className="sr-only peer"
                                                    checked={isStealth}
                                                    onChange={(e) => setIsStealth(e.target.checked)}
                                                />
                                                <div className="w-11 h-6 bg-zk-deep peer-focus:outline-none peer peer-checked:after:translate-x-full peer-checked:after:border-zk-gold after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zk-ash after:border-zk-ember after:border after:h-5 after:w-5 after:transition-all peer-checked:bg-zk-maroon border border-[rgba(201,168,76,0.12)]" style={{ borderRadius: '4px' }}></div>
                                            </label>
                                        </div>
                                    </div>

                                    <div className="h-px bg-[rgba(201,168,76,0.12)] w-full my-2" />

                                    {/* Security Section */}
                                    <div className="space-y-4">
                                        <h3 className="text-sm font-mono font-semibold text-zk-crimson uppercase tracking-wider">Danger Zone</h3>

                                        <div className="p-4 bg-[rgba(192,57,43,0.10)] border border-[rgba(192,57,43,0.25)]" style={{ borderRadius: '4px' }}>
                                            <div className="font-medium text-zk-ivory text-sm mb-1 text-center font-body">Nuke This Device</div>
                                            <div className="text-xs text-zk-ash mb-4 text-center font-mono">
                                                Wipes all messages, conversations, and encryption keys from local storage.
                                            </div>

                                            {!showNukeConfirm ? (
                                                <button
                                                    type="button"
                                                    onClick={() => setShowNukeConfirm(true)}
                                                    className="w-full py-2.5 bg-[rgba(192,57,43,0.15)] hover:bg-[rgba(192,57,43,0.25)] text-zk-crimson border border-[rgba(192,57,43,0.30)] text-sm font-bold transition-colors font-display uppercase tracking-wider"
                                                    style={{ borderRadius: '2px' }}
                                                >
                                                    Initiate Nuke Sequence
                                                </button>
                                            ) : (
                                                <div className="flex flex-col gap-2">
                                                    <div className="text-xs text-zk-crimson text-center font-bold mb-1 uppercase tracking-widest animate-pulse font-mono">Confirm Destructive Action</div>
                                                    <div className="flex gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => setShowNukeConfirm(false)}
                                                            className="flex-1 py-2 bg-zk-deep text-zk-ivory text-sm font-medium hover:bg-[rgba(107,26,26,0.15)] transition-colors font-body"
                                                            style={{ borderRadius: '2px' }}
                                                        >
                                                            Cancel
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={handleNukeDevice}
                                                            className="flex-1 py-2 bg-zk-crimson text-zk-ivory text-sm font-bold hover:bg-[#D44235] transition-colors font-display uppercase"
                                                            style={{ borderRadius: '2px' }}
                                                        >
                                                            CONFIRM NUKE
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                </form>
                            </div>

                            <div className="p-4 border-t border-[rgba(201,168,76,0.12)] bg-zk-surface flex items-center justify-between">
                                <div className="text-xs text-zk-gold px-2 font-mono font-medium h-4">
                                    {settingsToast}
                                </div>
                                <div className="flex gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setIsSettingsOpen(false)}
                                        className="px-5 py-2 text-sm text-zk-ash font-medium hover:text-zk-ivory transition-colors font-body"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        form="settings-form"
                                        type="submit"
                                        className="px-6 py-2 bg-zk-maroon text-zk-ivory text-sm font-display font-bold hover:bg-zk-hot transition-colors border border-zk-hot uppercase tracking-wider"
                                        style={{ borderRadius: '2px' }}
                                    >
                                        Save Changes
                                    </button>
                                </div>
                            </div>

                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* TIC-TAC-TOE GAME MODAL */}
            <AnimatePresence>
                {isGameOpen && (
                    <TicTacToeWidget
                        mySymbol="X"
                        sendGameMove={sendGameMove}
                        setOnGameMove={setOnGameMove}
                        onClose={() => setIsGameOpen(false)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

export default ChatWindow;
