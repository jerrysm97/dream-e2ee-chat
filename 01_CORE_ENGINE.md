# Core Engine: Signaling, Queuing & Real-time

## 1. Asynchronous Messaging (WhatsApp Mode)
- **Engine:** Supabase Realtime + Temporary DB Queue.
- **Logic:**
    1. User A encrypts a message for User B.
    2. User A attempts to send via Supabase Realtime channel `chat_room_B`.
    3. If User B acknowledges (Presence is active), done.
    4. If User B is offline, User A writes to the `message_queue` table.
- **Client Storage:** Once delivered, messages are saved in local SQLite and deleted from Supabase.

## 2. VoIP & Video (IMO Mode)
- **Protocol:** WebRTC (Peer-to-Peer).
- **Signaling:** Supabase Realtime channel `signal_UserB_UUID`.
- **Process (First Principles):**
    1. **Caller** generates an SDP Offer (describing video/audio codecs).
    2. **Caller** pushes Offer to `signal_UserB_UUID`.
    3. **Receiver** gets Offer, generates SDP Answer.
    4. Both exchange ICE Candidates (network paths) via the same Realtime channel.
    5. P2P stream begins. Realtime channel is closed to save concurrent connection quotas.