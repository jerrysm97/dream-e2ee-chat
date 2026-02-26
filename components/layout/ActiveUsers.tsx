import React from 'react';
import { Video } from 'lucide-react';

interface ActiveUsersProps {
    onlineUsers: Set<string>;
    activeCallPeerId: string | null;
}

export default function ActiveUsers({ onlineUsers, activeCallPeerId }: ActiveUsersProps) {
    return (
        <section className="bg-zk-deep border border-[rgba(201,168,76,0.12)] p-5 w-full" style={{ borderRadius: '4px' }}>
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs font-mono text-zk-ash uppercase tracking-wider">Active Now</h2>
                <span className="text-xs text-zk-gold bg-[rgba(201,168,76,0.08)] px-3 py-1 border border-[rgba(201,168,76,0.15)] flex items-center gap-2 font-mono" style={{ borderRadius: '2px' }}>
                    <div className="w-2 h-2 bg-zk-gold animate-gold-pulse" style={{ borderRadius: '50%' }} />
                    {onlineUsers?.size || 0} Online
                </span>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2">
                {Array.from(onlineUsers || []).map(uid => (
                    <div
                        key={uid}
                        className={`relative flex-shrink-0 w-14 h-14 border-2 p-[2px] cursor-pointer transition-all ${activeCallPeerId === uid ? 'border-zk-hot shadow-zk-glow' : 'border-[rgba(201,168,76,0.12)] hover:border-[rgba(201,168,76,0.35)]'}`}
                        style={{ borderRadius: '2px' }}
                        title={uid}
                    >
                        <div className="w-full h-full bg-zk-maroon flex items-center justify-center text-zk-gold font-display font-bold text-sm overflow-hidden" style={{ borderRadius: '2px' }}>
                            {activeCallPeerId === uid ? <Video size={18} className="text-zk-gold" /> : uid.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-zk-gold border-2 border-zk-void" style={{ borderRadius: '50%' }} />
                    </div>
                ))}
                {(onlineUsers?.size === 0 || !onlineUsers) && (
                    <p className="text-sm text-zk-ash font-body py-4">No peers online.</p>
                )}
            </div>
        </section>
    );
}
