/**
 * VideoCallOverlay.tsx
 *
 * Full-screen IMO-style video call overlay with:
 *  - Remote video (full bleed background)
 *  - Local video (picture-in-picture, bottom-right)
 *  - Screen Shield: blacks out remote video on tab/window blur
 *  - Watermark: repeating "Secure Call" overlay to deter screen captures
 *  - Call controls: End Call, Mute, Camera toggle
 */

"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";

interface VideoCallOverlayProps {
    /** UUID of the user being called, or the incoming caller's UUID. */
    targetUserId: string;
    /** The local camera/mic stream */
    localStream: MediaStream | null;
    /** The remote peer's stream */
    remoteStream: MediaStream | null;
    /** Called when the end call button is tapped. */
    onEndCall: () => void;
}

// ─── Icons (inline SVG to avoid icon library dependency) ─────────────────────

const PhoneOffIcon = () => (
    <svg viewBox="0 0 24 24" className="w-6 h-6 fill-white" xmlns="http://www.w3.org/2000/svg">
        <path d="M1.414 2.828A2 2 0 0 1 4.243 2.83l3.194 3.193a2 2 0 0 1 .34 2.328l-1.42 2.367a13.05 13.05 0 0 0 5.96 5.96l2.366-1.42a2 2 0 0 1 2.329.341l3.192 3.192a2 2 0 0 1-.002 2.829l-1.26 1.26c-1.607 1.61-4.1 1.928-6.068.77C7.624 20.756 3.244 16.376.649 11.116-.51 9.148-.191 6.655 1.415 5.05l1.26-1.26-.001.038zM2 21l20-20" />
        <line x1="2" y1="2" x2="22" y2="22" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
);

const MicIcon = ({ muted }: { muted: boolean }) => (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
        {muted ? (
            <>
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
            </>
        ) : (
            <>
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
            </>
        )}
    </svg>
);

const CameraIcon = ({ off }: { off: boolean }) => (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
        {off ? (
            <>
                <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34" />
                <path d="M23 7l-7 5 7 5V7z" />
                <line x1="1" y1="1" x2="23" y2="23" />
            </>
        ) : (
            <>
                <polygon points="23 7 16 12 23 17 23 7" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </>
        )}
    </svg>
);

// ─── Component ────────────────────────────────────────────────────────────────

const VideoCallOverlay: React.FC<VideoCallOverlayProps> = ({
    targetUserId,
    localStream,
    remoteStream,
    onEndCall,
}) => {

    // Video element refs — srcObject is set imperatively (not via props)
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);

    // Call control state
    const [isMuted, setIsMuted] = useState(false);
    const [isCameraOff, setIsCameraOff] = useState(false);
    const [callStatus, setCallStatus] = useState<"connecting" | "active" | "ended">("connecting");

    // ── Screen Shield state ───────────────────────────────────────────────────
    const [shieldActive, setShieldActive] = useState(false);

    // ── Attach stream to <video> via ref ─────────────────────────────────────

    useEffect(() => {
        if (localVideoRef.current && localStream) {
            localVideoRef.current.srcObject = localStream;
        }
    }, [localStream]);

    useEffect(() => {
        if (remoteVideoRef.current && remoteStream) {
            remoteVideoRef.current.srcObject = remoteStream;
            setCallStatus("active");
        }
    }, [remoteStream]);

    // ── Screen Shield: blur / visibilitychange listeners ─────────────────────

    useEffect(() => {
        const activate = () => setShieldActive(true);
        const deactivate = () => setShieldActive(false);

        // Tab switch (mobile/desktop)
        document.addEventListener("visibilitychange", () => {
            document.hidden ? activate() : deactivate();
        });

        // Window focus/blur (clicking outside browser, Alt+Tab, etc.)
        window.addEventListener("blur", activate);
        window.addEventListener("focus", deactivate);

        return () => {
            document.removeEventListener("visibilitychange", activate);
            window.removeEventListener("blur", activate);
            window.removeEventListener("focus", deactivate);
        };
    }, []);

    // ── Control handlers ─────────────────────────────────────────────────────

    const handleEndCall = useCallback(() => {
        setCallStatus("ended");
        onEndCall();
    }, [onEndCall]);

    const toggleMute = useCallback(() => {
        if (!localStream) return;
        localStream.getAudioTracks().forEach((track) => {
            track.enabled = isMuted; // toggle: if currently muted → re-enable
        });
        setIsMuted((prev) => !prev);
    }, [localStream, isMuted]);

    const toggleCamera = useCallback(() => {
        if (!localStream) return;
        localStream.getVideoTracks().forEach((track) => {
            track.enabled = isCameraOff; // toggle
        });
        setIsCameraOff((prev) => !prev);
    }, [localStream, isCameraOff]);

    // ─── Render ───────────────────────────────────────────────────────────────

    return (
        <div
            className="fixed inset-0 z-[9999] bg-black flex flex-col"
            role="dialog"
            aria-modal="true"
            aria-label="Video call"
        >

            {/* ── Remote video (full bleed) ─────────────────────────────────────── */}
            <div className="relative flex-1 overflow-hidden bg-gray-950">

                <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
                    style={{
                        // ── Privacy: prevent drag-to-save and context menu on video
                        pointerEvents: "none",
                        userSelect: "none",
                        WebkitUserSelect: "none",
                    }}
                />

                {/* ── Watermark overlay ──────────────────────────────────────────── */}
                {/* Repeating diagonal text deters physical screen capture photos */}
                <div
                    aria-hidden="true"
                    className="absolute inset-0 pointer-events-none select-none"
                    style={{
                        background: `repeating-linear-gradient(
              -45deg,
              transparent,
              transparent 80px,
              rgba(255,255,255,0.035) 80px,
              rgba(255,255,255,0.035) 82px
            )`,
                    }}
                >
                    {/* Tiled text watermarks */}
                    <div
                        className="absolute inset-0 flex flex-wrap overflow-hidden opacity-[0.07]"
                        style={{ gap: "60px", padding: "40px", transform: "rotate(-25deg) scale(1.4)" }}
                    >
                        {Array.from({ length: 40 }).map((_, i) => (
                            <span
                                key={i}
                                className="text-white text-xs font-semibold tracking-widest whitespace-nowrap flex-shrink-0"
                            >
                                SECURE CALL
                            </span>
                        ))}
                    </div>
                </div>

                {/* ── Screen Shield ─────────────────────────────────────────────────── */}
                {shieldActive && (
                    <div
                        className="absolute inset-0 bg-black/80 glass-panel flex flex-col items-center justify-center z-10"
                        aria-live="assertive"
                    >
                        <div className="w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center mb-4">
                            <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                                />
                            </svg>
                        </div>
                        <p className="text-white text-lg font-semibold tracking-wide">Screen Shield Active</p>
                        <p className="text-gray-400 text-sm mt-2">Video paused for privacy</p>
                    </div>
                )}

                {/* ── Call status badge ─────────────────────────────────────────────── */}
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
                    {callStatus === "connecting" && (
                        <div className="bg-black/60 backdrop-blur-sm rounded-full px-4 py-1.5 flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                            <span className="text-white text-sm">Connecting…</span>
                        </div>
                    )}
                    {callStatus === "active" && (
                        <div className="bg-black/60 backdrop-blur-sm rounded-full px-4 py-1.5 flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                            <span className="text-white text-sm">🔒 E2EE · Connected</span>
                        </div>
                    )}
                </div>

                {/* ── Peer label ───────────────────────────────────────────────────── */}
                <div className="absolute top-14 left-4 z-20">
                    <p className="text-white/80 text-sm font-medium">
                        {targetUserId.slice(0, 8)}…
                    </p>
                </div>

                {/* ── Local video (Picture-in-Picture) ──────────────────────────────── */}
                <div className="absolute bottom-28 right-4 z-20 w-28 h-40 rounded-2xl overflow-hidden shadow-2xl border border-white/20">
                    {isCameraOff ? (
                        <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                            <span className="text-white/60 text-xs">Camera off</span>
                        </div>
                    ) : (
                        <video
                            ref={localVideoRef}
                            autoPlay
                            playsInline
                            muted={true} // ← CRITICAL: prevents catastrophic audio feedback loop
                            className="w-full h-full object-cover scale-x-[-1]" // mirror local feed
                            style={{
                                pointerEvents: "none",
                                userSelect: "none",
                            }}
                        />
                    )}
                    {/* PiP label */}
                    <div className="absolute bottom-1 left-1/2 -translate-x-1/2">
                        <span className="text-white/70 text-[9px] bg-black/40 rounded px-1">You</span>
                    </div>
                </div>
            </div>

            {/* ── Control bar ──────────────────────────────────────────────────── */}
            <div className="flex-shrink-0 bg-gray-900/95 backdrop-blur-md px-8 py-5 flex items-center justify-center gap-6">

                {/* Toggle Mute */}
                <button
                    onClick={toggleMute}
                    className={`
            w-14 h-14 rounded-full flex items-center justify-center transition-all duration-150
            active:scale-90
            ${isMuted ? "bg-white/20 ring-2 ring-white/40" : "bg-gray-700 hover:bg-gray-600"}
          `}
                    aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
                >
                    <MicIcon muted={isMuted} />
                </button>

                {/* End Call — centre, red, largest */}
                <button
                    onClick={handleEndCall}
                    className="
            w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 active:scale-90
            flex items-center justify-center shadow-lg shadow-red-500/40
            transition-all duration-150
          "
                    aria-label="End call"
                >
                    <PhoneOffIcon />
                </button>

                {/* Toggle Camera */}
                <button
                    onClick={toggleCamera}
                    className={`
            w-14 h-14 rounded-full flex items-center justify-center transition-all duration-150
            active:scale-90
            ${isCameraOff ? "bg-white/20 ring-2 ring-white/40" : "bg-gray-700 hover:bg-gray-600"}
          `}
                    aria-label={isCameraOff ? "Turn camera on" : "Turn camera off"}
                >
                    <CameraIcon off={isCameraOff} />
                </button>
            </div>
        </div>
    );
};

export default VideoCallOverlay;
