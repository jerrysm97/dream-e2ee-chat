import { create } from 'zustand';

interface RTCStore {
    peers: Record<string, RTCPeerConnection>;
    dataChannels: Record<string, RTCDataChannel>;
    audioStreams: Record<string, MediaStream>;
    activeHuddle: string | null;
    addPeer: (userId: string, conn: RTCPeerConnection) => void;
    joinHuddle: (roomId: string) => Promise<void>;
    leaveHuddle: () => void;
}

export const useRTCStore = create<RTCStore>((set) => ({
    peers: {},
    dataChannels: {},
    audioStreams: {},
    activeHuddle: null,
    addPeer: (userId, conn) => set((state) => ({ peers: { ...state.peers, [userId]: conn } })),
    joinHuddle: async (roomId) => {
        // Implementation will come in Phase 3
    },
    leaveHuddle: () => {
        // Implementation will come in Phase 3
    },
}));
