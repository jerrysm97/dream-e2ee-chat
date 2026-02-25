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

export default function HomePage() {
    const [session, setSession] = useState<Session | null>(null);
    const [sessionLoading, setSessionLoading] = useState(true);
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

    // Cleanup call if active peer changes or active call stops
    useEffect(() => {
        if (activeCallPeerId && !rtc.isCallActive && !incomingCall) {
            // Re-sync UI state if call drops unexpectedly
            setActiveCallPeerId(null);
        }
    }, [rtc.isCallActive, activeCallPeerId, incomingCall]);

    const handleSignOut = useCallback(async () => {
        rtc.endCall();
        await supabase.auth.signOut();
        setSession(null);
        setActiveCallPeerId(null);
        setIncomingCall(null);
    }, [rtc]);

    if (sessionLoading) {
        return (
            <div className="loading-screen">
                <div className="loading-spinner" />
                <p className="loading-text">Loading Dream…</p>
            </div>
        );
    }

    if (!session) {
        return <LoginForm onSuccess={() => { }} />;
    }

    const myUserId = session.user.id;

    return (
        <>
            <button id="sign-out-btn" className="signout-btn" onClick={handleSignOut} aria-label="Sign out">
                Sign out
            </button>

            {/* Chat Window gets sendFile and transferProgress */}
            <ChatWindow
                myUserId={myUserId}
                onStartCall={handleStartCall}
                sendFile={rtc.sendFile}
                transferProgress={rtc.transferProgress}
            />

            {/* Incoming call banner */}
            {incomingCall && !activeCallPeerId && (
                <div className="incoming-banner">
                    <div className="incoming-icon">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
                            <polygon points="23 7 16 12 23 17 23 7" />
                            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                        </svg>
                    </div>
                    <div>
                        <div className="incoming-title">Incoming video call</div>
                        <div className="incoming-from">{incomingCall.callerId}</div>
                    </div>
                    <div className="incoming-actions">
                        <button id="decline-call-btn" className="btn-decline"
                            onClick={() => { setIncomingCall(null); setActiveCallPeerId(null); }}>
                            Decline
                        </button>
                        <button id="accept-call-btn" className="btn-accept"
                            onClick={handleAcceptCall}>
                            Accept
                        </button>
                    </div>
                </div>
            )}

            {activeCallPeerId && rtc.isCallActive && (
                <VideoCallOverlay
                    targetUserId={activeCallPeerId}
                    localStream={rtc.localStream}
                    remoteStream={rtc.remoteStream}
                    onEndCall={handleCloseCall}
                />
            )}
        </>
    );
}
