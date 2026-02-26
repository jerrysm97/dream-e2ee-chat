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
        <div className="w-80 h-full overflow-y-auto bg-white p-5 border-r border-dream-border flex flex-col gap-5 shrink-0">
            <ActiveUsers onlineUsers={onlineUsers} activeCallPeerId={null} />

            <section className="bg-dream-surface border border-dream-border p-5 rounded-xl">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xs font-semibold text-dream-muted uppercase tracking-wider">Groups</h2>
                </div>
                <div className="grid grid-cols-1 gap-3">
                    {mockGroups.map(group => (
                        <div key={group.id} className="bg-white border border-dream-border hover:border-dream-primaryLight transition-colors p-4 rounded-xl cursor-pointer flex items-center gap-3 group">
                            <span className="text-2xl w-10 h-10 flex items-center justify-center bg-dream-received rounded-lg">{group.emoji}</span>
                            <div>
                                <h3 className="text-dream-text text-sm font-semibold">{group.name}</h3>
                                <p className="text-xs text-dream-muted mt-0.5">{group.members} members</p>
                            </div>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}
