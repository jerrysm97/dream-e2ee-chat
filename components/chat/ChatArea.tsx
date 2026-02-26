import React, { useState, useEffect } from 'react';
import { createClient } from "@supabase/supabase-js";
import ChatWindow from "../ChatWindow";
import { useWebRTC } from "../../hooks/useWebRTC";
import { useAuthKeys } from "../../lib/useAuthKeys";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function ChatArea() {
    const [myUserId, setMyUserId] = useState<string>("local-user");
    const [isStealth, setIsStealth] = useState(false);

    useEffect(() => {
        supabase.auth.getSession().then(({ data }) => {
            if (data?.session?.user?.id) {
                setMyUserId(data.session.user.id);
            }
        });
    }, []);

    useAuthKeys();
    const rtc = useWebRTC(myUserId);

    const handleStartCall = (id: string) => {
        rtc.startCall(id);
    };

    const handleSignOut = () => {
        rtc.endCall();
        supabase.auth.signOut().then(() => {
            window.location.reload();
        });
    };

    return (
        <div className="flex-1 bg-white relative flex flex-col min-w-0">
            <ChatWindow
                myUserId={myUserId}
                onStartCall={handleStartCall}
                sendFile={rtc.sendFile}
                transferProgress={rtc.transferProgress}
                isStealth={isStealth}
                setIsStealth={setIsStealth}
                onSignOut={handleSignOut}
                sendGameMove={rtc.sendGameMove}
                setOnGameMove={rtc.setOnGameMove}
            />
        </div>
    );
}
