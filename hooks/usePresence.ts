import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export function usePresence(myUserId: string | null | undefined) {
    const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (!myUserId) return;

        const channel = supabase.channel('dream-presence', {
            config: {
                presence: {
                    key: myUserId,
                },
            },
        });

        channel
            .on('presence', { event: 'sync' }, () => {
                const newState = channel.presenceState();
                const active = new Set<string>();
                for (const userId of Object.keys(newState)) {
                    active.add(userId);
                }
                setOnlineUsers(active);
            })
            .on('presence', { event: 'join' }, ({ key }) => {
                setOnlineUsers((prev) => {
                    const next = new Set(prev);
                    next.add(key);
                    return next;
                });
            })
            .on('presence', { event: 'leave' }, ({ key }) => {
                setOnlineUsers((prev) => {
                    // Check if they're actually gone from presence state (multiple tabs)
                    const state = channel.presenceState();
                    if (!state[key] || state[key].length === 0) {
                        const next = new Set(prev);
                        next.delete(key);
                        return next;
                    }
                    return prev;
                });
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await channel.track({ status: 'online' });
                }
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, [myUserId]);

    return onlineUsers;
}
