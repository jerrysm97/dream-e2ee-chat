"use client";

import React from 'react';
import { MessageCircle, ShieldCheck, LogOut, Newspaper } from "lucide-react";
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
        <nav className="w-16 bg-zk-surface flex flex-col items-center py-6 gap-6 z-50 border-r border-[rgba(201,168,76,0.12)] shrink-0">
            <div className="w-10 h-10 bg-zk-maroon text-zk-gold flex items-center justify-center mb-4 font-display font-bold text-sm" style={{ borderRadius: '2px' }}>
                <ShieldCheck size={20} />
            </div>

            <button
                onClick={() => router.push("/portal")}
                className={`p-3 transition-colors cursor-pointer ${isActive("/portal") ? "text-zk-gold bg-[rgba(107,26,26,0.25)] border-l-2 border-zk-hot" : "text-zk-ash hover:text-zk-ivory hover:bg-[rgba(107,26,26,0.15)]"}`}
                style={{ borderRadius: '2px' }}
                title="Messages"
            >
                <MessageCircle size={18} />
            </button>

            <button
                onClick={() => router.push("/feed")}
                className={`p-3 transition-colors cursor-pointer ${isActive("/feed") ? "text-zk-gold bg-[rgba(107,26,26,0.25)] border-l-2 border-zk-hot" : "text-zk-ash hover:text-zk-ivory hover:bg-[rgba(107,26,26,0.15)]"}`}
                style={{ borderRadius: '2px' }}
                title="Feed"
            >
                <Newspaper size={18} />
            </button>

            <div className="mt-auto flex flex-col gap-4">
                <button onClick={onSignOut} className="p-3 text-zk-crimson hover:bg-[rgba(192,57,43,0.10)] transition-colors cursor-pointer" style={{ borderRadius: '2px' }} title="Sign Out">
                    <LogOut size={18} />
                </button>
            </div>
        </nav>
    );
}
