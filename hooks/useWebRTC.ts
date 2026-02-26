/**
 * useWebRTC.ts
 *
 * P2P video calling hook using WebRTC + Supabase Realtime broadcast signaling.
 *
 * ─── Signaling Architecture ──────────────────────────────────────────────────
 * WebRTC requires an out-of-band signaling channel to exchange:
 *   1. SDP Offer / Answer  (session description — codec, media format)
 *   2. ICE Candidates       (network routes to punch through NAT)
 *
 * This hook uses Supabase's channel.send({ type: 'broadcast' }) for signaling.
 * NO database writes occur during a call — the entire handshake is ephemeral.
 *
 * Each user listens on their own personal channel: `webrtc_signal_[MY_USER_ID]`
 * The caller sends signals to:  `webrtc_signal_[TARGET_USER_ID]`
 *
 * ─── Call Flow ───────────────────────────────────────────────────────────────
 * CALLER                              CALLEE
 *   startCall(targetId)
 *     → getUserMedia
 *     → createOffer
 *     → setLocalDescription
 *     → broadcast 'offer' to target ──────→ answerCall(offer, callerId)
 *                                              → getUserMedia
 *                                              → setRemoteDescription(offer)
 *                                              → createAnswer
 *                                              → setLocalDescription(answer)
 *                                              → broadcast 'answer' to caller
 *     ← onSignal('answer')
 *     → setRemoteDescription(answer)
 *
 * Both sides:
 *   RTCPeerConnection fires 'icecandidate'
 *     → broadcast 'ice-candidate' to peer
 *     ← onSignal('ice-candidate')
 *     → addIceCandidate(candidate)
 *
 * ─── STUN Server (NAT Traversal) ─────────────────────────────────────────────
 * Google's free public STUN server allows peers behind NAT/firewalls to
 * discover their public IP:port. For production, add TURN server credentials
 * to handle symmetric NAT (corporate networks, some mobile carriers).
 * ────────────────────────────────────────────────────────────────────────────
 */

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient, RealtimeChannel } from "@supabase/supabase-js";
import { loadPrivateKey } from "../lib/crypto/keyStore";
import { encryptBinary, decryptBinary } from "../lib/crypto/cryptoEngine";
import { db } from "../lib/localDb";

// ─── Supabase client ──────────────────────────────────────────────────────────

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ─── Constants ────────────────────────────────────────────────────────────────

const ICE_SERVERS: RTCConfiguration = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }, // fallback STUN
    ],
};

// ─── Signal payload types ─────────────────────────────────────────────────────

interface OfferSignal {
    type: "offer";
    sdp: RTCSessionDescriptionInit;
    callerId: string;
}

interface AnswerSignal {
    type: "answer";
    sdp: RTCSessionDescriptionInit;
}

interface IceCandidateSignal {
    type: "ice-candidate";
    candidate: RTCIceCandidateInit;
}

interface HangupSignal {
    type: "hangup";
}

type SignalPayload = OfferSignal | AnswerSignal | IceCandidateSignal | HangupSignal;

// ─── Hook Return Type ─────────────────────────────────────────────────────────

/** Payload sent over data channel for game moves */
export interface GameMovePayload {
    type: 'GAME_MOVE';
    game: 'tictactoe';
    payload: { index: number; player: 'X' | 'O' };
}

export interface UseWebRTCReturn {
    /** The local camera/mic stream — attach to a <video> element with ref.srcObject */
    localStream: MediaStream | null;
    /** The remote peer's stream — attach to a <video> element with ref.srcObject */
    remoteStream: MediaStream | null;
    /** Whether a call is currently active */
    isCallActive: boolean;
    /** Initiate an outbound call to a target user */
    startCall: (targetUserId: string) => Promise<void>;
    /** Accept an inbound call offer from a peer */
    answerCall: (offer: RTCSessionDescriptionInit, callerId: string) => Promise<void>;
    /** Hang up and clean up all media resources */
    endCall: () => void;
    /** The transfer progress percentage for sender and receiver */
    transferProgress: { sender: number; receiver: number };
    /** Send a file directly over the WebRTC data channel */
    sendFile: (file: File) => Promise<void>;
    /** Send a game move over the WebRTC data channel */
    sendGameMove: (index: number, player: 'X' | 'O') => void;
    /** Register a callback to receive game moves from the peer */
    setOnGameMove: (cb: ((move: GameMovePayload) => void) | null) => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useWebRTC(myUserId: string): UseWebRTCReturn {
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const [isCallActive, setIsCallActive] = useState(false);
    // Track the active peer ID so endCall knows who to hang up on
    const [activePeerId, setActivePeerId] = useState<string | null>(null);
    const activePeerIdRef = useRef<string | null>(null);

    const [transferProgress, setTransferProgress] = useState<{ sender: number, receiver: number }>({ sender: 0, receiver: 0 });
    const dataChannelRef = useRef<RTCDataChannel | null>(null);
    const onGameMoveRef = useRef<((move: GameMovePayload) => void) | null>(null);

    useEffect(() => {
        activePeerIdRef.current = activePeerId;
    }, [activePeerId]);

    // Refs for mutable objects that must not trigger re-renders
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const myChannelRef = useRef<RealtimeChannel | null>(null);
    // The peer's channel we broadcast signals TO (not our own listener)
    const peerChannelRef = useRef<RealtimeChannel | null>(null);

    // ── Cleanup ───────────────────────────────────────────────────────────────

    /**
     * Stops all media tracks, closes the peer connection, and removes channels.
     * Safe to call multiple times (guards against null refs internally).
     */
    const endCall = useCallback(() => {
        // Broadcast hangup to peer before closing channels
        if (activePeerId) {
            broadcastToPeer(activePeerId, { type: "hangup" });
        }

        // Stop all local media tracks (releases camera LED / mic indicator)
        localStreamRef.current?.getTracks().forEach((track) => {
            track.stop();
        });
        localStreamRef.current = null;

        // Close the peer connection
        if (peerConnectionRef.current) {
            peerConnectionRef.current.onicecandidate = null;
            peerConnectionRef.current.ontrack = null;
            peerConnectionRef.current.oniceconnectionstatechange = null;
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
        }

        // Remove Supabase channels
        if (peerChannelRef.current) {
            supabase.removeChannel(peerChannelRef.current);
            peerChannelRef.current = null;
        }

        if (dataChannelRef.current) {
            dataChannelRef.current.close();
            dataChannelRef.current = null;
        }

        setTransferProgress({ sender: 0, receiver: 0 });

        setLocalStream(null);
        setRemoteStream(null);
        setIsCallActive(false);
        setActivePeerId(null);
    }, [activePeerId]);

    // ── Helper: acquire media ─────────────────────────────────────────────────

    async function acquireLocalMedia(): Promise<MediaStream> {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
            audio: true,
        });
        localStreamRef.current = stream;
        setLocalStream(stream);
        return stream;
    }

    // ── Helper: create and wire up DataChannel ────────────────────────────────

    const setupDataChannel = useCallback((channel: RTCDataChannel) => {
        channel.binaryType = "arraybuffer";
        channel.bufferedAmountLowThreshold = 65536; // 64KB

        let receivedBuffers: Uint8Array[] = [];
        let expectedSize = 0;
        let receivedSize = 0;
        let fileMetadata: any = null;

        let cachedPrivateKey: CryptoKey | null = null;
        let cachedPeerPublicKey: string | null = null;

        channel.onmessage = async (event) => {
            if (typeof event.data === "string") {
                const data = JSON.parse(event.data);
                if (data.type === 'GAME_MOVE') {
                    // Route game moves to the registered callback
                    onGameMoveRef.current?.(data as GameMovePayload);
                } else if (data.type === 'metadata') {
                    fileMetadata = data;
                    receivedBuffers = [];
                    receivedSize = 0;
                    expectedSize = data.fileSize;
                    setTransferProgress(prev => ({ ...prev, receiver: 0 }));

                    const currentPeer = activePeerIdRef.current;
                    if (currentPeer) {
                        try {
                            cachedPrivateKey = await loadPrivateKey();
                            const conv = await db.conversations.get([myUserId, currentPeer].sort().join("__"));
                            cachedPeerPublicKey = conv?.peer_public_key || null;
                        } catch (err) {
                            console.error("[useWebRTC] DataChannel key fetch error:", err);
                        }
                    }
                } else if (data.type === 'eof') {
                    if (!fileMetadata) return;
                    const blob = new Blob(receivedBuffers as BlobPart[], { type: fileMetadata.fileType });
                    const url = URL.createObjectURL(blob);

                    const a = document.createElement("a");
                    a.style.display = "none";
                    a.href = url;
                    a.download = fileMetadata.fileName;
                    document.body.appendChild(a);
                    a.click();

                    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
                    setTransferProgress(prev => ({ ...prev, receiver: 100 }));
                    setTimeout(() => setTransferProgress(prev => ({ ...prev, receiver: 0 })), 3000);
                }
            } else if (event.data instanceof ArrayBuffer) {
                try {
                    if (!cachedPrivateKey || !cachedPeerPublicKey) return;

                    const encryptedChunk = new Uint8Array(event.data);
                    const decryptedChunk = await decryptBinary(encryptedChunk, cachedPeerPublicKey, cachedPrivateKey);

                    receivedBuffers.push(decryptedChunk);
                    receivedSize += decryptedChunk.length;

                    if (expectedSize > 0) {
                        const progress = Math.round((receivedSize / expectedSize) * 100);
                        if (progress % 5 === 0 || progress === 100) {
                            setTransferProgress(prev => ({ ...prev, receiver: Math.min(progress, 100) }));
                        }
                    }
                } catch (err) {
                    console.error("[useWebRTC] Error decrypting file chunk:", err);
                }
            }
        };

        channel.onopen = () => console.log("[useWebRTC] Data channel open");
        channel.onclose = () => console.log("[useWebRTC] Data channel closed");
        dataChannelRef.current = channel;
    }, [myUserId]);

    // ── Helper: create and wire up RTCPeerConnection ──────────────────────────

    function createPeerConnection(targetUserId: string): RTCPeerConnection {
        const pc = new RTCPeerConnection(ICE_SERVERS);

        pc.ondatachannel = (event) => {
            setupDataChannel(event.channel);
        };

        // Broadcast ICE candidates to the peer as they are gathered
        pc.onicecandidate = (event) => {
            if (!event.candidate) return; // null signals end-of-candidates gathering

            const signal: IceCandidateSignal = {
                type: "ice-candidate",
                candidate: event.candidate.toJSON(),
            };

            broadcastToPeer(targetUserId, signal);
        };

        // When remote tracks arrive, build the remote MediaStream
        const remoteMediaStream = new MediaStream();
        pc.ontrack = (event) => {
            event.streams[0]?.getTracks().forEach((track) => {
                remoteMediaStream.addTrack(track);
            });
            setRemoteStream(remoteMediaStream);
        };

        // Monitor ICE connection for unexpected disconnects
        pc.oniceconnectionstatechange = () => {
            const state = pc.iceConnectionState;
            console.log(`[useWebRTC] ICE state: ${state}`);
            if (state === "failed" || state === "disconnected" || state === "closed") {
                console.warn("[useWebRTC] Peer connection lost. Cleaning up.");
                endCall();
            }
        };

        peerConnectionRef.current = pc;
        return pc;
    }

    // ── Helper: broadcast a signal to a specific user's channel ──────────────

    function broadcastToPeer(targetUserId: string, signal: SignalPayload): void {
        // Create/reuse a channel pointed at the target's personal listening channel
        if (!peerChannelRef.current) {
            peerChannelRef.current = supabase.channel(`webrtc_signal_${targetUserId}`);
        }

        peerChannelRef.current.send({
            type: "broadcast",
            event: signal.type,
            payload: signal,
        });
    }

    // ── 1. startCall ──────────────────────────────────────────────────────────

    /**
     * Initiates an outbound video call to a target user.
     * Grabs local media, creates an SDP offer, and broadcasts it.
     */
    const startCall = useCallback(async (targetUserId: string) => {
        if (isCallActive) {
            console.warn("[useWebRTC] Call already active. End current call first.");
            return;
        }

        try {
            const stream = await acquireLocalMedia();
            const pc = createPeerConnection(targetUserId);

            // Create data channel (caller only)
            const dc = pc.createDataChannel("fileTransfer", { ordered: true });
            setupDataChannel(dc);

            // Add all local tracks to the peer connection
            stream.getTracks().forEach((track) => pc.addTrack(track, stream));

            // Create and set the SDP offer
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            const signal: OfferSignal = {
                type: "offer",
                sdp: offer,
                callerId: myUserId,
            };

            broadcastToPeer(targetUserId, signal);
            setIsCallActive(true);
            setActivePeerId(targetUserId);
            console.log(`[useWebRTC] Offer sent to ${targetUserId}`);
        } catch (err) {
            console.error("[useWebRTC] startCall failed:", err);
            endCall();
        }
    }, [isCallActive, myUserId, endCall]);

    // ── 2. answerCall ─────────────────────────────────────────────────────────

    /**
     * Answers an inbound call. Called when an 'offer' signal is received.
     * Grabs local media, sets remote description, creates and sends an SDP answer.
     */
    const answerCall = useCallback(async (
        offer: RTCSessionDescriptionInit,
        callerId: string
    ) => {
        if (isCallActive) {
            console.warn("[useWebRTC] Already in a call. Rejecting incoming offer.");
            return;
        }

        try {
            const stream = await acquireLocalMedia();
            const pc = createPeerConnection(callerId);

            // Add local tracks
            stream.getTracks().forEach((track) => pc.addTrack(track, stream));

            // Set caller's offer as the remote description
            await pc.setRemoteDescription(new RTCSessionDescription(offer));

            // Create and send the answer
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            const signal: AnswerSignal = {
                type: "answer",
                sdp: answer,
            };

            broadcastToPeer(callerId, signal);
            setIsCallActive(true);
            setActivePeerId(callerId);
            console.log(`[useWebRTC] Answered call from ${callerId}`);
        } catch (err) {
            console.error("[useWebRTC] answerCall failed:", err);
            endCall();
        }
    }, [isCallActive, endCall]);

    // ── 3. Incoming signal listener (our personal channel) ───────────────────

    useEffect(() => {
        if (!myUserId) return;

        /**
         * Subscribe to our own personal channel.
         * Every peer addresses us at `webrtc_signal_[MY_USER_ID]`.
         */
        const channel = supabase
            .channel(`webrtc_signal_${myUserId}`)
            .on("broadcast", { event: "offer" }, ({ payload }: { payload: OfferSignal }) => {
                console.log(`[useWebRTC] Incoming offer from ${payload.callerId}`);
                // In a real app, show an incoming call UI and let the user tap Accept.
                // Here we expose answerCall so the UI can wire up the accept button.
                // Optionally auto-answer: answerCall(payload.sdp, payload.callerId);
            })
            .on("broadcast", { event: "answer" }, ({ payload }: { payload: AnswerSignal }) => {
                console.log("[useWebRTC] Received answer from peer.");
                peerConnectionRef.current
                    ?.setRemoteDescription(new RTCSessionDescription(payload.sdp))
                    .catch((err) => console.error("[useWebRTC] setRemoteDescription(answer) failed:", err));
            })
            .on("broadcast", { event: "ice-candidate" }, ({ payload }: { payload: IceCandidateSignal }) => {
                const candidate = new RTCIceCandidate(payload.candidate);
                peerConnectionRef.current
                    ?.addIceCandidate(candidate)
                    .catch((err) => console.error("[useWebRTC] addIceCandidate failed:", err));
            })
            .on("broadcast", { event: "hangup" }, () => {
                console.log("[useWebRTC] Peer hung up the active call.");
                endCall();
            })
            .subscribe((status) => {
                console.log(`[useWebRTC] Signal channel status: ${status}`);
            });

        myChannelRef.current = channel;

        // ── Cleanup on unmount ────────────────────────────────────────────────
        return () => {
            endCall();
            supabase.removeChannel(channel);
            myChannelRef.current = null;
        };
    }, [myUserId, answerCall, endCall]);

    // ── 4. sendFile ───────────────────────────────────────────────────────────

    const sendFile = useCallback(async (file: File) => {
        if (!dataChannelRef.current || dataChannelRef.current.readyState !== "open") {
            throw new Error("Data channel is not open. Are you in a call?");
        }

        const currentPeer = activePeerIdRef.current;
        if (!currentPeer) throw new Error("No active peer");

        const myPrivateKey = await loadPrivateKey();
        const conv = await db.conversations.get([myUserId, currentPeer].sort().join("__"));
        const peerPublicKey = conv?.peer_public_key;

        if (!myPrivateKey || !peerPublicKey) {
            throw new Error("Missing keys for encryption");
        }

        const dc = dataChannelRef.current;

        // 1. Send metadata
        dc.send(JSON.stringify({
            type: 'metadata',
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size
        }));

        setTransferProgress(prev => ({ ...prev, sender: 0 }));

        // 2. Chunking logic (16KB)
        const CHUNK_SIZE = 16384;
        let offset = 0;

        const readChunk = async (chunkBlob: Blob): Promise<Uint8Array> => {
            const buffer = await chunkBlob.arrayBuffer();
            return new Uint8Array(buffer);
        };

        while (offset < file.size) {
            const chunkBlob = file.slice(offset, offset + CHUNK_SIZE);
            const chunkData = await readChunk(chunkBlob);

            const encryptedChunk = await encryptBinary(chunkData, peerPublicKey, myPrivateKey);

            // Wait if the buffer is too full
            if (dc.bufferedAmount > dc.bufferedAmountLowThreshold) {
                await new Promise<void>((resolve) => {
                    const listener = () => {
                        dc.removeEventListener('bufferedamountlow', listener);
                        resolve();
                    };
                    dc.addEventListener('bufferedamountlow', listener);
                });
            }

            dc.send(encryptedChunk as any);

            offset += CHUNK_SIZE;
            const progress = Math.round((offset / file.size) * 100);
            if (progress % 5 === 0 || progress === 100) {
                setTransferProgress(prev => ({ ...prev, sender: Math.min(progress, 100) }));
            }
        }

        // 3. Send EOF
        dc.send(JSON.stringify({ type: 'eof' }));
        setTransferProgress(prev => ({ ...prev, sender: 100 }));
        setTimeout(() => setTransferProgress(prev => ({ ...prev, sender: 0 })), 3000);
    }, [myUserId]);

    // ── 5. sendGameMove ──────────────────────────────────────────────────────

    const sendGameMove = useCallback((index: number, player: 'X' | 'O') => {
        if (!dataChannelRef.current || dataChannelRef.current.readyState !== 'open') {
            console.warn('[useWebRTC] Cannot send game move — data channel not open');
            return;
        }
        const payload: GameMovePayload = {
            type: 'GAME_MOVE',
            game: 'tictactoe',
            payload: { index, player },
        };
        dataChannelRef.current.send(JSON.stringify(payload));
    }, []);

    const setOnGameMove = useCallback((cb: ((move: GameMovePayload) => void) | null) => {
        onGameMoveRef.current = cb;
    }, []);

    return {
        localStream,
        remoteStream,
        isCallActive,
        startCall,
        answerCall,
        endCall,
        transferProgress,
        sendFile,
        sendGameMove,
        setOnGameMove,
    };
}
