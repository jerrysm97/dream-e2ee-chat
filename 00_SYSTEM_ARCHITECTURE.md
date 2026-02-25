# System Architecture & First Principles

## The Core Concept: Dumb Server, Smart Client
To survive on a free tier, Supabase must act solely as a dumb relay and a temporary queue. It is NOT the source of truth for chat history. The user's device is the source of truth.

## Infrastructure Map
- **Client (React Native/Next.js):** Handles UI, E2EE encryption/decryption, local SQLite storage, and WebRTC peer connections.
- **Supabase PostgreSQL:** Stores user identities, public encryption keys, and a temporary `message_queue`.
- **Supabase Realtime:** Broadcasts WebRTC SDP offers/answers and live presence.
- **Supabase Edge Functions:** Runs cron jobs to permanently delete old storage media (Statuses) and orphaned data.
- **External Dependency:** A STUN server (free via Google: `stun:stun.l.google.com:19302`) for WebRTC NAT traversal.

## Connection Lifecycle
1. App opens -> Authenticate -> Fetch `message_queue`.
2. Delete fetched messages from `message_queue`.
3. Connect to Supabase Realtime for active session.
4. App backgrounds -> Disconnect Realtime -> Rely on OS Push Notifications.