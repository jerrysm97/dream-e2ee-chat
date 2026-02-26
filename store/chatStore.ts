import { create } from 'zustand';

interface Channel {
    id: string;
    name: string;
}

interface Message {
    id: string;
    text: string;
    senderId: string;
    timestamp: string;
}

interface ChatStore {
    channels: Channel[];
    activeChannelId: string | null;
    messages: Record<string, Message[]>;
    setActiveChannel: (id: string) => void;
    appendMessage: (channelId: string, msg: Message) => void;
    pruneMessages: (channelId: string) => void;
}

export const useChatStore = create<ChatStore>((set) => ({
    channels: [],
    activeChannelId: null,
    messages: {},
    setActiveChannel: (id) => set({ activeChannelId: id }),
    appendMessage: (channelId, msg) => set((state) => {
        const channelMessages = state.messages[channelId] || [];
        return {
            messages: {
                ...state.messages,
                [channelId]: [...channelMessages, msg]
            }
        };
    }),
    pruneMessages: (channelId) => set((state) => {
        // Basic prune implementation
        return state;
    }),
}));
