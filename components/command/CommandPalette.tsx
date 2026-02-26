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
    tag: string;
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
        { id: "stealth", label: "/stealth-mode", tag: stealthMode ? "ON" : "OFF", action: () => setStealthMode(!stealthMode) },
        { id: "split", label: "/split-pane", tag: splitPaneMode, action: () => setSplitMode(splitPaneMode === "single" ? "split" : "single") },
        { id: "nuke", label: "/wipe-session", tag: "DANGER", action: async () => { await clearKeyStore(); await supabase.auth.signOut(); router.push("/login"); } },
        { id: "close", label: "/close", tag: "ESC", action: () => toggleCommandPalette() },
    ];

    const filteredCommands = query
        ? commands.filter(c => c.label.toLowerCase().includes(query.toLowerCase()))
        : commands;

    if (!commandPaletteOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-28 p-4" style={{ background: 'rgba(13, 0, 0, 0.92)' }}>
            <div className="w-full max-w-[560px] bg-zk-surface border border-[rgba(201,168,76,0.35)] shadow-[0_8px_40px_rgba(0,0,0,0.8),0_0_30px_rgba(139,32,32,0.20)] overflow-hidden flex flex-col max-h-[60vh] animate-palette-in" style={{ borderRadius: '4px' }}>
                <div className="flex items-center px-5 py-4 border-b border-[rgba(201,168,76,0.12)]">
                    <span className="text-zk-gold mr-3 font-mono">&gt;</span>
                    <input
                        ref={inputRef}
                        type="text"
                        className="flex-1 bg-transparent border-none outline-none text-zk-ivory placeholder:text-zk-ember font-mono text-sm"
                        placeholder="Type a command…"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter' && filteredCommands.length > 0) {
                                filteredCommands[0].action();
                                toggleCommandPalette();
                            }
                        }}
                    />
                    <div className="text-[10px] text-zk-gold border border-[rgba(201,168,76,0.12)] px-2 py-0.5 font-mono bg-[rgba(201,168,76,0.10)]" style={{ borderRadius: '2px' }}>ESC</div>
                </div>

                <div className="overflow-y-auto flex-1">
                    {filteredCommands.length === 0 ? (
                        <div className="p-4 text-center text-sm text-zk-ash font-body">No commands found.</div>
                    ) : (
                        <ul>
                            {filteredCommands.map((cmd, idx) => (
                                <li key={cmd.id}>
                                    <button
                                        className={`w-full text-left px-5 py-3 text-sm transition-all flex items-center justify-between ${idx === 0 && query ? 'bg-[rgba(107,26,26,0.30)] text-zk-ivory border-l-2 border-zk-gold' : 'text-zk-ash hover:bg-[rgba(107,26,26,0.15)] hover:text-zk-ivory cursor-pointer border-l-2 border-transparent'}`}
                                        onClick={() => {
                                            cmd.action();
                                            toggleCommandPalette();
                                        }}
                                    >
                                        <span className="font-mono">{cmd.label}</span>
                                        <span className={`text-xs font-mono px-2 py-0.5 ${cmd.tag === 'DANGER' ? 'text-zk-crimson bg-[rgba(192,57,43,0.10)]' : 'text-zk-gold bg-[rgba(201,168,76,0.10)]'}`} style={{ borderRadius: '2px' }}>{cmd.tag}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="px-5 py-2 border-t border-[rgba(201,168,76,0.12)] bg-zk-surface text-[10px] text-zk-ash flex justify-between font-mono">
                    <span>↑↓ Navigate · Enter Execute</span>
                    <span>ZK-TERMINAL · Ctrl+K</span>
                </div>
            </div>
        </div>
    );
}
