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
        return <div className="flex h-screen bg-zk-void items-center justify-center text-zk-gold font-display font-semibold text-lg tracking-wider">Initializing...</div>;
    }

    return (
        <div className="flex h-screen bg-zk-void text-zk-ivory font-body">
            <CommandPalette />
            <Sidebar />
            <main className="flex flex-1 overflow-hidden">
                <GroupGrid />
                <ChatArea />

                {splitPaneMode === 'split' && (
                    <aside className="w-72 border-l border-[rgba(201,168,76,0.12)] bg-zk-surface flex flex-col">
                        <div className="h-12 border-b border-[rgba(201,168,76,0.12)] flex items-center px-4 bg-zk-surface text-zk-ash text-xs uppercase tracking-wider font-mono font-semibold">
                            {rightPaneWidget || 'System Intel'}
                        </div>
                        <div className="flex-1 p-4 overflow-y-auto">
                            {!rightPaneWidget && (
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 bg-zk-gold" style={{ borderRadius: '50%' }}></div>
                                        <span className="text-xs text-zk-ivory font-mono">Connection: Active</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 bg-zk-maroon" style={{ borderRadius: '50%' }}></div>
                                        <span className="text-xs text-zk-ivory font-mono">Encryption: E2EE</span>
                                    </div>
                                    <div className="mt-8 text-xs text-zk-ash font-mono">
                                        Press Ctrl+K to toggle
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
