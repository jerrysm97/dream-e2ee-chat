import { create } from 'zustand';

interface UIStore {
    commandPaletteOpen: boolean;
    splitPaneMode: 'single' | 'split' | 'focus';
    rightPaneWidget: 'scratchpad' | 'game' | 'poll' | null;
    stealthMode: boolean;
    toggleCommandPalette: () => void;
    setSplitMode: (mode: UIStore['splitPaneMode']) => void;
    setRightPane: (widget: UIStore['rightPaneWidget']) => void;
    setStealthMode: (mode: boolean) => void;
}

export const useUIStore = create<UIStore>((set) => ({
    commandPaletteOpen: false,
    splitPaneMode: 'split',
    rightPaneWidget: null,
    stealthMode: false,
    toggleCommandPalette: () => set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen })),
    setSplitMode: (mode) => set({ splitPaneMode: mode }),
    setRightPane: (widget) => set({ rightPaneWidget: widget }),
    setStealthMode: (mode) => set({ stealthMode: mode }),
}));
