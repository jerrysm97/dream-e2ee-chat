"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import Sidebar from "../../components/layout/Sidebar";
import GroupGrid from "../../components/layout/GroupGrid";
import ChatArea from "../../components/chat/ChatArea";
import CommandPalette from "../../components/command/CommandPalette";
import { useUIStore } from "../../store/uiStore";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function PortalDashboard() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const { splitPaneMode, rightPaneWidget } = useUIStore();

    useEffect(() => {
        supabase.auth.getSession().then(({ data }) => {
            if (!data.session) {
                router.push('/login');
            } else {
                setLoading(false);
            }
        });
    }, [router]);

    if (loading) {
        return <div className="flex h-screen bg-white items-center justify-center text-dream-primary font-semibold text-lg">Loading...</div>;
    }

    return (
        <div className="flex h-screen bg-white text-dream-text">
            <CommandPalette />
            <Sidebar />
            <main className="flex flex-1 overflow-hidden">
                <GroupGrid />
                <ChatArea />

                {splitPaneMode === 'split' && (
                    <aside className="w-72 border-l border-dream-border bg-dream-surface flex flex-col">
                        <div className="h-12 border-b border-dream-border flex items-center px-4 bg-white text-dream-muted text-xs uppercase tracking-wider font-semibold">
                            {rightPaneWidget || 'Info Panel'}
                        </div>
                        <div className="flex-1 p-4 overflow-y-auto">
                            {!rightPaneWidget && (
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-dream-online"></div>
                                        <span className="text-xs text-dream-text">Connection: Active</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-dream-primary"></div>
                                        <span className="text-xs text-dream-text">Encryption: E2EE</span>
                                    </div>
                                    <div className="mt-8 text-xs text-dream-muted">
                                        Press Ctrl+K to toggle this pane
                                    </div>
                                </div>
                            )}
                        </div>
                    </aside>
                )}
            </main>
        </div>
    );
}
