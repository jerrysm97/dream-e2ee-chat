"use client";

import React from 'react';
import ChatWindow from '../ChatWindow';
import { useWebRTC } from '../../hooks/useWebRTC';
import { createClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function ChatArea() {
    const [userId, setUserId] = useState<string | null>(null);

    useEffect(() => {
        supabase.auth.getSession().then(({ data }) => {
            if (data.session?.user?.id) {
                setUserId(data.session.user.id);
            }
        });
    }, []);

    const webrtc = useWebRTC(userId);

    if (!userId) {
        return (
            <div className="flex-1 flex items-center justify-center bg-zk-void text-zk-gold font-display font-semibold tracking-wider">
                Authenticating...
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-hidden bg-zk-void">
            <ChatWindow
                myUserId={userId}
                onlineUsers={webrtc.onlineUsers}
                activeCallPeerId={webrtc.activeCallPeerId}
                sendMessage={webrtc.sendMessage}
                onCallUser={(uid) => webrtc.callUser(uid)}
                sendGameMove={webrtc.sendGameMove}
                setOnGameMove={(cb: any) => webrtc.setOnGameMove(cb)}
            />
        </div>
    );
}
