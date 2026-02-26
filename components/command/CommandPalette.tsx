"use client";

import React, { useEffect, useState, useRef } from "react";
import { useUIStore } from "../../store/uiStore";
import { useRouter } from "next/navigation";
import { clearKeyStore } from "../../lib/crypto/keyStore";
import { createClient } from "@supabase/supabase-js";
import { Search } from "lucide-react";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Command {
    id: string;
    label: string;
    description: string;
    action: () => void;
}

export default function CommandPalette() {
    const { commandPaletteOpen, toggleCommandPalette, setStealthMode, stealthMode, setSplitMode, splitPaneMode } = useUIStore();
    const [query, setQuery] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);
    const router = useRouter();

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "k") {
                e.preventDefault();
                toggleCommandPalette();
            }
            if (e.key === "Escape" && commandPaletteOpen) {
                toggleCommandPalette();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [toggleCommandPalette, commandPaletteOpen]);

    useEffect(() => {
        if (commandPaletteOpen && inputRef.current) {
            inputRef.current.focus();
        } else {
            setQuery("");
        }
    }, [commandPaletteOpen]);

    const commands: Command[] = [
        {
            id: "stealth",
            label: "Toggle Stealth Mode",
            description: `Currently ${stealthMode ? "ON" : "OFF"}`,
            action: () => setStealthMode(!stealthMode),
        },
        {
            id: "split",
            label: "Toggle Split Pane",
            description: `Currently ${splitPaneMode}`,
            action: () => setSplitMode(splitPaneMode === "single" ? "split" : "single"),
        },
        {
            id: "nuke",
            label: "Destroy Keys & Sign Out",
            description: "Wipe local encryption keys",
            action: async () => {
                await clearKeyStore();
                await supabase.auth.signOut();
                router.push("/login");
            },
        },
        {
            id: "close",
            label: "Close",
            description: "Close the command palette",
            action: () => toggleCommandPalette(),
        }
    ];

    const filteredCommands = query
        ? commands.filter(c => c.label.toLowerCase().includes(query.toLowerCase()) || c.id.toLowerCase().includes(query.toLowerCase()))
        : commands;

    if (!commandPaletteOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-28 bg-black/20 backdrop-blur-sm p-4">
            <div className="w-full max-w-xl bg-white border border-dream-border shadow-2xl rounded-2xl overflow-hidden flex flex-col max-h-[60vh]">
                <div className="flex items-center px-4 py-3 border-b border-dream-border bg-dream-surface">
                    <Search size={16} className="text-dream-muted mr-3" />
                    <input
                        ref={inputRef}
                        type="text"
                        className="flex-1 bg-transparent border-none outline-none text-dream-text placeholder-dream-muted text-sm"
                        placeholder="Search commands..."
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter' && filteredCommands.length > 0) {
                                filteredCommands[0].action();
                                toggleCommandPalette();
                            }
                        }}
                    />
                    <div className="text-[10px] text-dream-muted border border-dream-border px-2 py-0.5 rounded-md font-medium bg-white">ESC</div>
                </div>

                <div className="overflow-y-auto flex-1 p-2">
                    {filteredCommands.length === 0 ? (
                        <div className="p-4 text-center text-sm text-dream-muted">No commands found.</div>
                    ) : (
                        <ul className="space-y-1">
                            {filteredCommands.map((cmd, idx) => (
                                <li key={cmd.id}>
                                    <button
                                        className={`w-full text-left px-4 py-3 text-sm rounded-xl transition-colors flex items-center justify-between ${idx === 0 && query ? 'bg-dream-primary/10 text-dream-primary' : 'text-dream-text hover:bg-dream-surface cursor-pointer'}`}
                                        onClick={() => {
                                            cmd.action();
                                            toggleCommandPalette();
                                        }}
                                    >
                                        <span className="font-medium">{cmd.label}</span>
                                        <span className="text-xs text-dream-muted">{cmd.description}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="px-4 py-2 border-t border-dream-border bg-dream-surface text-[10px] text-dream-muted flex justify-between">
                    <span>↑↓ Navigate · Enter Select</span>
                    <span>Dream · Ctrl+K</span>
                </div>
            </div>
        </div>
    );
}
