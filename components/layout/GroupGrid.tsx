import React from 'react';
import ActiveUsers from './ActiveUsers';

const mockGroups = [
    { id: 1, name: "CS 401 Study Group", members: 4, emoji: "💻" },
    { id: 2, name: "Design Systems", members: 12, emoji: "✨" },
    { id: 3, name: "Weekend Hackathon", members: 3, emoji: "🚀" },
];

export default function GroupGrid() {
    const onlineUsers = new Set<string>(['peerA', 'peerB']);

    return (
        <div className="w-80 h-full overflow-y-auto bg-zk-void p-5 border-r border-[rgba(201,168,76,0.12)] flex flex-col gap-5 shrink-0">
            <ActiveUsers onlineUsers={onlineUsers} activeCallPeerId={null} />

            <section className="bg-zk-deep border border-[rgba(201,168,76,0.12)] p-5" style={{ borderRadius: '4px' }}>
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xs font-mono text-zk-ash uppercase tracking-wider">Groups</h2>
                </div>
                <div className="grid grid-cols-1 gap-3">
                    {mockGroups.map(group => (
                        <div key={group.id} className="bg-zk-deep border border-[rgba(201,168,76,0.12)] hover:border-[rgba(201,168,76,0.35)] hover:bg-[rgba(107,26,26,0.10)] transition-all p-4 cursor-pointer flex items-center gap-3" style={{ borderRadius: '4px' }}>
                            <span className="text-2xl w-10 h-10 flex items-center justify-center bg-zk-maroon" style={{ borderRadius: '2px' }}>{group.emoji}</span>
                            <div>
                                <h3 className="text-zk-ivory text-sm font-body font-semibold">{group.name}</h3>
                                <p className="text-xs text-zk-gold mt-0.5 font-mono">{group.members} members</p>
                            </div>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}
