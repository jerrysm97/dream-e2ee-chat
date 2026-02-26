/**
 * app/page.tsx — Master Application Controller
 * Uses semantic CSS classes from globals.css (no Tailwind)
 */
"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { createClient, Session, RealtimeChannel } from "@supabase/supabase-js";
import { useAuthKeys } from "../lib/useAuthKeys";
import ChatWindow from "../components/ChatWindow";
import VideoCallOverlay from "../components/VideoCallOverlay";
import { useWebRTC } from "../hooks/useWebRTC";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface IncomingCallState {
    callerId: string;
    offer: RTCSessionDescriptionInit;
}

// ─── Login Screen ─────────────────────────────────────────────────────────────

const LoginForm: React.FC<{ onSuccess: () => void }> = ({ onSuccess }) => {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [isSignUp, setIsSignUp] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);
        const { error: authError } = isSignUp
            ? await supabase.auth.signUp({ email, password })
            : await supabase.auth.signInWithPassword({ email, password });
        setLoading(false);
        if (authError) { setError(authError.message); } else { onSuccess(); }
    };

    return (
        <div className="login-screen">
            <div style={{ width: "100%", maxWidth: 400 }}>
                {/* Header */}
                <div className="login-header">
                    <div className="login-logo">🔐</div>
                    <div className="login-title">Dream</div>
                    <div className="login-subtitle">End-to-End Encrypted Messaging</div>
                </div>

                {/* Card */}
                <form onSubmit={handleSubmit} className="login-card">
                    <div className="login-heading">
                        {isSignUp ? "Create Account" : "Sign In"}
                    </div>

                    <input
                        id="email"
                        className="login-field"
                        type="email"
                        placeholder="Email address"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                    <input
                        id="password"
                        className="login-field"
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                    />

                    {error && <div className="login-error">{error}</div>}

                    <button
                        id="auth-submit-btn"
                        type="submit"
                        className="login-submit"
                        disabled={loading}
                    >
                        {loading ? (
                            <><div className="spinner" />{isSignUp ? "Creating…" : "Signing in…"}</>
                        ) : (
                            isSignUp ? "Create Account" : "Sign In"
                        )}
                    </button>

                    <button
                        type="button"
                        className="login-toggle"
                        onClick={() => { setIsSignUp((v) => !v); setError(null); }}
                    >
                        {isSignUp
                            ? "Already have an account? Sign in"
                            : "Don't have an account? Sign up"}
                    </button>
                </form>

                <div className="login-footer">
                    🔒 Messages encrypted with Curve25519 + XSalsa20-Poly1305
                </div>
            </div>
        </div>
    );
};

// ─── Root App ─────────────────────────────────────────────────────────────────

// ─── Root App ─────────────────────────────────────────────────────────────────

import { usePresence } from "../hooks/usePresence";
import { db } from "../lib/localDb";
import { useLiveQuery } from "dexie-react-hooks";
import { motion, AnimatePresence } from "framer-motion";
import { Home, MessageCircle, Users, Settings, ShieldCheck, FolderGit2, Video, Copy, LogOut } from "lucide-react";

type ViewType = 'dashboard' | 'chat';

export default function HomePage() {
    const [session, setSession] = useState<Session | null>(null);
    const [sessionLoading, setSessionLoading] = useState(true);
    const [currentView, setCurrentView] = useState<ViewType>('dashboard');
    const [copiedId, setCopiedId] = useState(false);

    // Advanced Settings
    const [isStealth, setIsStealth] = useState(() => {
        if (typeof window !== "undefined") {
            return localStorage.getItem("dream_stealth") === "true";
        }
        return false;
    });

    // WebRTC & Chat States
    const [activeCallPeerId, setActiveCallPeerId] = useState<string | null>(null);
    const [incomingCall, setIncomingCall] = useState<IncomingCallState | null>(null);
    const [isIncomingCall, setIsIncomingCall] = useState(false);
    const signalChannelRef = useRef<RealtimeChannel | null>(null);

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session: s } }) => {
            setSession(s);
            setSessionLoading(false);
        });
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
            setSession(s);
        });
        return () => subscription.unsubscribe();
    }, []);

    useAuthKeys();
    const rtc = useWebRTC(session?.user?.id || "");
    const onlineUsers = usePresence(session?.user?.id, isStealth);

    // Media Tray Query
    const recentMessages = useLiveQuery(() =>
        db.messages.orderBy('timestamp').reverse().limit(4).toArray()
    );

    // Group Query (Mocked for now until group UI is built out, but we need the table access eventually)
    // const classGroups = useLiveQuery(() => db.groups.toArray())
    const mockGroups = [
        { id: 1, name: "CS 401 Study Group", members: 4, emoji: "💻" },
        { id: 2, name: "Design Systems", members: 12, emoji: "✨" },
        { id: 3, name: "Weekend Hackathon", members: 3, emoji: "🚀" },
    ];

    useEffect(() => {
        if (!session?.user?.id) return;
        const userId = session.user.id;
        const channel = supabase
            .channel(`webrtc_signal_${userId}`)
            .on("broadcast", { event: "offer" }, ({ payload }: { payload: { sdp: RTCSessionDescriptionInit; callerId: string } }) => {
                setIncomingCall({ callerId: payload.callerId, offer: payload.sdp });
                setActiveCallPeerId(payload.callerId);
                setIsIncomingCall(true);
            })
            .subscribe();
        signalChannelRef.current = channel;
        return () => { supabase.removeChannel(channel); signalChannelRef.current = null; };
    }, [session?.user?.id]);

    const handleStartCall = useCallback((targetUserId: string) => {
        setIncomingCall(null);
        setIsIncomingCall(false);
        setActiveCallPeerId(targetUserId);
        rtc.startCall(targetUserId);
    }, [rtc]);

    const handleAcceptCall = useCallback(() => {
        if (incomingCall) {
            setActiveCallPeerId(incomingCall.callerId);
            setIsIncomingCall(true);
            rtc.answerCall(incomingCall.offer, incomingCall.callerId);
            setIncomingCall(null);
        }
    }, [incomingCall, rtc]);

    const handleCloseCall = useCallback(() => {
        rtc.endCall();
        setActiveCallPeerId(null);
        setIncomingCall(null);
        setIsIncomingCall(false);
    }, [rtc]);

    const handleSignOut = useCallback(async () => {
        rtc.endCall();
        await supabase.auth.signOut();
        setSession(null);
        setActiveCallPeerId(null);
        setIncomingCall(null);
    }, [rtc]);

    const copyUserId = () => {
        if (session?.user?.id) {
            navigator.clipboard.writeText(session.user.id);
            setCopiedId(true);
            setTimeout(() => setCopiedId(false), 2000);
        }
    };

    if (sessionLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-portal-bg text-white">
                <div className="animate-pulse-fast text-neon-green">Loading Dream...</div>
            </div>
        );
    }

    if (!session) {
        return <LoginForm onSuccess={() => { }} />;
    }

    const myUserId = session.user.id;

    return (
        <div className="flex h-screen w-screen overflow-hidden bg-portal-gradient text-white font-sans selection:bg-neon-green/30">
            {/* 1. SLIM NAVIGATION DOCK */}
            <nav className="w-20 glass-panel flex flex-col items-center py-6 gap-8 z-50 border-r border-white/10">
                <div className="w-10 h-10 rounded-xl bg-neon-green/20 text-neon-green flex items-center justify-center mb-4">
                    <ShieldCheck size={24} />
                </div>

                <button
                    onClick={() => setCurrentView('dashboard')}
                    className={`p-3 rounded-xl transition-all duration-300 relative ${currentView === 'dashboard' ? 'text-neon-green bg-neon-green/10' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                >
                    <Home size={24} />
                    {currentView === 'dashboard' && <motion.div layoutId="dock-indicator" className="absolute left-[-24px] top-1/2 -translate-y-1/2 w-1.5 h-6 bg-neon-green rounded-r-md shadow-[0_0_10px_#25D366]" />}
                </button>

                <button
                    onClick={() => setCurrentView('chat')}
                    className={`p-3 rounded-xl transition-all duration-300 relative ${currentView === 'chat' ? 'text-neon-green bg-neon-green/10' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                >
                    <MessageCircle size={24} />
                    {currentView === 'chat' && <motion.div layoutId="dock-indicator" className="absolute left-[-24px] top-1/2 -translate-y-1/2 w-1.5 h-6 bg-neon-green rounded-r-md shadow-[0_0_10px_#25D366]" />}
                </button>

                <button className="p-3 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 transition-colors">
                    <Users size={24} />
                </button>

                <div className="mt-auto flex flex-col gap-4">
                    <button className="p-3 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 transition-colors">
                        <Settings size={24} />
                    </button>
                    <button onClick={handleSignOut} className="p-3 rounded-xl text-red-400 hover:bg-red-500/10 transition-colors">
                        <LogOut size={24} />
                    </button>
                </div>
            </nav>

            {/* 2. MAIN CONTENT AREA */}
            <main className="flex-1 relative overflow-hidden">
                <AnimatePresence mode="wait">

                    {/* DASHBOARD VIEW */}
                    {currentView === 'dashboard' && (
                        <motion.div
                            key="dashboard"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
                            className="h-full p-8 overflow-y-auto"
                        >
                            <h1 className="text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-white/50 mb-8 mt-2">
                                Welcome Back
                            </h1>

                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                                {/* LEFT COLUMN (Main Widgets) */}
                                <div className="lg:col-span-2 space-y-6">

                                    {/* ACTIVE NOW (Presence) */}
                                    <section className="glass-panel p-6 rounded-3xl">
                                        <div className="flex items-center justify-between mb-4">
                                            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest">Active Now</h2>
                                            <span className="text-xs text-neon-green bg-neon-green/10 px-3 py-1 rounded-full flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full bg-neon-green animate-pulse" />
                                                {onlineUsers?.size || 0} Online
                                            </span>
                                        </div>
                                        <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
                                            {Array.from(onlineUsers || []).map(uid => (
                                                <div
                                                    key={uid}
                                                    className={`relative flex-shrink-0 w-16 h-16 rounded-full border-2 p-[2px] cursor-pointer transition-all hover:scale-105 active-now-ring
                                                        ${activeCallPeerId === uid ? 'border-neon-blue animate-pulse-border' : 'border-neon-green/50 hover:border-neon-green'}`}
                                                    title={uid}
                                                >
                                                    <div className="w-full h-full rounded-full bg-white/5 flex items-center justify-center font-medium overflow-hidden shadow-inner">
                                                        {activeCallPeerId === uid ? <Video size={18} className="text-neon-blue" /> : uid.slice(0, 2).toUpperCase()}
                                                    </div>
                                                    <div className="absolute bottom-0 right-0 w-4 h-4 bg-neon-green border-2 border-portal-bg rounded-full" />
                                                </div>
                                            ))}
                                            {(onlineUsers?.size === 0 || !onlineUsers) && (
                                                <p className="text-sm text-gray-500 italic py-4">No classmates online.</p>
                                            )}
                                        </div>
                                    </section>

                                    {/* CLASS HANGOUTS GRID */}
                                    <div className="hangout-grid">
                                        <section className="glass-panel p-6 rounded-3xl">
                                            <div className="flex justify-between items-center mb-4">
                                                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest">Class Hangouts</h2>
                                                <button className="text-xs text-neon-blue hover:underline">View All</button>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                {mockGroups.map(group => (
                                                    <div key={group.id} className="bg-white/5 border border-white/5 hover:border-white/20 hover:bg-white/10 transition-all p-5 rounded-2xl cursor-pointer flex flex-col gap-3 group">
                                                        <span className="text-3xl group-hover:scale-110 transition-transform origin-bottom-left">{group.emoji}</span>
                                                        <div>
                                                            <h3 className="font-semibold text-base">{group.name}</h3>
                                                            <p className="text-xs text-gray-400 mt-1">{group.members} members active</p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </section>
                                    </div>

                                </div>

                                {/* RIGHT COLUMN (Quick Actions & Identity) */}
                                <div className="space-y-6">

                                    {/* MY ID WIDGET */}
                                    <section className="glass-panel p-6 rounded-3xl pb-8 relative overflow-hidden group">
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-neon-blue/10 blur-[40px] rounded-full -mr-10 -mt-10 pointer-events-none group-hover:bg-neon-blue/20 transition-colors" />
                                        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-4">My Identity</h2>
                                        <div className="bg-black/40 border border-white/5 p-3 rounded-xl flex items-center justify-between">
                                            <span className="my-id-badge font-mono text-sm text-gray-300 truncate mr-2">{myUserId}</span>
                                            <button onClick={copyUserId} className="text-neon-blue hover:text-white transition-colors p-2 bg-neon-blue/10 hover:bg-neon-blue/20 rounded-lg shrink-0">
                                                {copiedId ? <ShieldCheck size={16} /> : <Copy size={16} />}
                                            </button>
                                        </div>
                                        <AnimatePresence>
                                            {copiedId && (
                                                <motion.p
                                                    initial={{ opacity: 0, y: 10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0 }}
                                                    className="text-xs text-neon-green mt-3 absolute bottom-3 font-medium"
                                                >
                                                    ID Copied to clipboard!
                                                </motion.p>
                                            )}
                                        </AnimatePresence>
                                    </section>

                                    {/* QUICK ACTIONS */}
                                    <section className="glass-panel p-6 rounded-3xl">
                                        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-4">Quick Actions</h2>
                                        <div className="flex flex-col gap-3">
                                            <button className="flex items-center gap-3 bg-white/5 hover:bg-neon-green hover:text-black hover:border-transparent transition-all p-4 rounded-xl text-sm font-medium border border-white/10 group">
                                                <Video size={18} className="text-neon-green group-hover:text-black" />
                                                Start a Huddle
                                            </button>
                                            <button className="flex items-center gap-3 bg-white/5 hover:bg-neon-blue hover:text-black hover:border-transparent transition-all p-4 rounded-xl text-sm font-medium border border-white/10 group">
                                                <FolderGit2 size={18} className="text-neon-blue group-hover:text-black" />
                                                Shared Boards
                                            </button>
                                            <button className="flex items-center gap-3 bg-white/5 hover:bg-white hover:text-black hover:border-transparent transition-all p-4 rounded-xl text-sm font-medium border border-white/10 group">
                                                <Users size={18} className="text-white group-hover:text-black" />
                                                Create Group
                                            </button>
                                        </div>
                                    </section>

                                    {/* MEDIA TRAY */}
                                    <section className="glass-panel p-6 rounded-3xl">
                                        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-4">Recent Snippets</h2>
                                        <div className="grid grid-cols-2 gap-3">
                                            {recentMessages?.map(msg => (
                                                <div key={msg.id} className="aspect-square bg-white/5 rounded-xl border border-white/10 flex items-center justify-center hover:scale-[1.03] hover:bg-white/10 hover:border-white/20 transition-all cursor-pointer">
                                                    <span className="text-xs text-gray-400 truncate max-w-[80%] px-2">
                                                        {msg.text.includes('http') ? '🔗 link' : '📄 data'}
                                                    </span>
                                                </div>
                                            ))}
                                            {[...Array(Math.max(0, 4 - (recentMessages?.length || 0)))].map((_, i) => (
                                                <div key={`empty-${i}`} className="aspect-square bg-white/5 rounded-xl border border-white/5 flex items-center justify-center opacity-30">
                                                    <span className="text-[10px] text-gray-600 font-mono">Empty</span>
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* CHAT INTERFACE VIEW */}
                    {currentView === 'chat' && (
                        <motion.div
                            key="chat"
                            initial={{ opacity: 0, scale: 0.98, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.98, y: -10 }}
                            transition={{ duration: 0.3, ease: 'easeOut' }}
                            className="h-full w-full bg-portal-bg relative z-10"
                        >
                            <div className="absolute inset-x-0 top-0 bottom-16 bg-transparent z-[100] pointer-events-none">
                                <div className="w-full h-full pointer-events-auto">
                                    <ChatWindow
                                        myUserId={myUserId}
                                        onStartCall={handleStartCall}
                                        sendFile={rtc.sendFile}
                                        transferProgress={rtc.transferProgress}
                                        isStealth={isStealth}
                                        setIsStealth={setIsStealth}
                                        onSignOut={handleSignOut}
                                    />
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>

            {/* CALL OVERLAYS (Globally Active) */}
            <AnimatePresence>
                {incomingCall && !activeCallPeerId && (
                    <motion.div
                        initial={{ opacity: 0, y: -50, x: '-50%' }}
                        animate={{ opacity: 1, y: 0, x: '-50%' }}
                        exit={{ opacity: 0, y: -50, x: '-50%' }}
                        className="fixed top-8 left-1/2 -translate-x-1/2 glass-panel p-4 pr-6 rounded-2xl shadow-2xl flex items-center gap-5 z-[100] border-neon-green/30"
                    >
                        <div className="w-12 h-12 bg-neon-green rounded-full flex items-center justify-center text-black shadow-[0_0_15px_#25D366] animate-pulse-fast">
                            <Video size={24} />
                        </div>
                        <div>
                            <div className="text-sm font-bold text-white mb-0.5">Incoming Huddle</div>
                            <div className="text-xs text-gray-400 max-w-[150px] truncate font-mono">{incomingCall.callerId}</div>
                        </div>
                        <div className="flex gap-2 ml-4">
                            <button className="px-4 py-2 hover:bg-red-500/20 text-gray-400 hover:text-red-500 rounded-lg text-sm font-bold transition-all" onClick={() => { setIncomingCall(null); setActiveCallPeerId(null); }}>
                                Decline
                            </button>
                            <button className="px-6 py-2 bg-neon-green text-black hover:bg-neon-green/90 rounded-lg text-sm font-bold shadow-[0_0_10px_rgba(37,211,102,0.3)] transition-all" onClick={handleAcceptCall}>
                                Accept
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {activeCallPeerId && rtc.isCallActive && (
                <VideoCallOverlay
                    targetUserId={activeCallPeerId}
                    localStream={rtc.localStream}
                    remoteStream={rtc.remoteStream}
                    onEndCall={handleCloseCall}
                />
            )}
        </div>
    );
}
