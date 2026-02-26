import React from 'react';
import { Video } from 'lucide-react';

interface ActiveUsersProps {
    onlineUsers: Set<string>;
    activeCallPeerId: string | null;
}

export default function ActiveUsers({ onlineUsers, activeCallPeerId }: ActiveUsersProps) {
    return (
        <section className="bg-white border border-dream-border p-5 rounded-xl w-full">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs font-semibold text-dream-muted uppercase tracking-wider">Active Now</h2>
                <span className="text-xs text-dream-online bg-green-50 px-3 py-1 rounded-full border border-green-200 flex items-center gap-2 font-medium">
                    <div className="w-2 h-2 rounded-full bg-dream-online animate-pulse" />
                    {onlineUsers?.size || 0} Online
                </span>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2">
                {Array.from(onlineUsers || []).map(uid => (
                    <div
                        key={uid}
                        className={`relative flex-shrink-0 w-14 h-14 rounded-xl border-2 p-[2px] cursor-pointer transition-all ${activeCallPeerId === uid ? 'border-dream-primary shadow-md' : 'border-dream-border hover:border-dream-primaryLight'}`}
                        title={uid}
                    >
                        <div className="w-full h-full bg-dream-surface rounded-[10px] flex items-center justify-center text-dream-text font-semibold text-sm overflow-hidden">
                            {activeCallPeerId === uid ? <Video size={18} className="text-dream-primary" /> : uid.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-dream-online border-2 border-white rounded-full" />
                    </div>
                ))}
                {(onlineUsers?.size === 0 || !onlineUsers) && (
                    <p className="text-sm text-dream-muted py-4">No users online right now.</p>
                )}
            </div>
        </section>
    );
}
