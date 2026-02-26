"use client";

import React from 'react';
import { Home, MessageCircle, ShieldCheck, LogOut, Newspaper } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function Sidebar() {
    const router = useRouter();
    const pathname = usePathname();

    const isActive = (path: string) => pathname === path;

    const onSignOut = async () => {
        await supabase.auth.signOut();
        router.push("/login");
    };

    return (
        <nav className="w-16 bg-dream-surface flex flex-col items-center py-6 gap-6 z-50 border-r border-dream-border shrink-0">
            <div className="w-10 h-10 bg-dream-primary text-white flex items-center justify-center mb-4 rounded-lg shadow-sm">
                <ShieldCheck size={20} />
            </div>

            <button
                onClick={() => router.push("/portal")}
                className={`p-3 rounded-lg transition-colors cursor-pointer ${isActive("/portal") ? "text-dream-primary bg-dream-primary/10" : "text-dream-muted hover:text-dream-primary hover:bg-dream-primary/5"}`}
                title="Messages"
            >
                <MessageCircle size={20} />
            </button>

            <button
                onClick={() => router.push("/feed")}
                className={`p-3 rounded-lg transition-colors cursor-pointer ${isActive("/feed") ? "text-dream-primary bg-dream-primary/10" : "text-dream-muted hover:text-dream-primary hover:bg-dream-primary/5"}`}
                title="Feed"
            >
                <Newspaper size={20} />
            </button>

            <div className="mt-auto flex flex-col gap-4">
                <button onClick={onSignOut} className="p-3 rounded-lg text-dream-danger hover:bg-dream-danger/5 transition-colors cursor-pointer" title="Sign Out">
                    <LogOut size={20} />
                </button>
            </div>
        </nav>
    );
}
