# Dream — Future Improvement Suggestions

## 🏗️ Architecture
- **Offline-first PWA**: Add service worker for offline message composition and auto-sync
- **Message chunking**: Split large messages into smaller encrypted chunks for reliability
- **Multi-device sync**: Implement a key rotation scheme for syncing across devices
- **WebSocket fallback**: Add SSE/WebSocket transport when WebRTC fails behind strict NATs

## 🔐 Security Enhancements
- **Forward secrecy**: Implement Double Ratchet (Signal Protocol) for per-message keys
- **Key verification**: QR code / emoji fingerprint verification for public keys
- **Disappearing media**: Auto-delete photos after viewing (ephemeral media)
- **Screenshot detection**: Notify sender when recipient screenshots a message
- **Passphrase-locked keys**: Encrypt local IndexedDB keys with a user passphrase
- **Audit log**: Client-side log of key exchanges, session changes, and nuke events

## 📱 Mobile & Responsiveness
- **Responsive sidebar**: Collapsible sidebar on mobile with swipe gestures
- **Push notifications**: Web Push API for background message alerts
- **Touch-friendly UI**: Swipe-to-reply, long-press for message actions
- **Native app wrapper**: Capacitor/Tauri wrapper for iOS and Android builds

## 💬 Chat Features
- **Voice messages**: Record and send audio clips via WebRTC data channel
- **Reactions/Emoji**: Add emoji reactions to individual messages
- **Message editing**: Allow editing sent messages with edit history
- **Read receipts toggle**: Per-conversation read receipt control
- **Group chats**: Multi-party E2EE using Sender Keys or MLS protocol
- **Message search**: Full-text search across local message history
- **Pinned messages**: Pin important messages in a conversation
- **Typing indicators**: Show real-time typing status (currently per-peer)

## 📰 Feed & Social
- **Comments system**: Threaded comments on posts with real-time updates
- **Post likes persistence**: Store likes in Supabase (currently client-side only)
- **User profiles**: Dedicated profile pages with bio, posts, and stats
- **Follow system**: Follow/unfollow users to curate your feed
- **Media galleries**: Grid view of shared images in conversations
- **Stories/Status**: Ephemeral 24-hour status updates

## ⚡ Performance
- **Virtual scrolling**: Virtualize long message lists for memory efficiency
- **Image compression**: Client-side compression before upload (e.g. browser-image-compression)
- **Lazy loading**: Lazy-load images, code snippets, and heavy components
- **IndexedDB pagination**: Paginate message queries instead of loading all at once
- **Bundle splitting**: Dynamic imports for CommandPalette, TicTacToe, Feed

## 🎨 UI/UX
- **Dark mode toggle**: Add dark mode variant of the crimson theme
- **Custom themes**: Let users choose accent colors beyond crimson
- **Onboarding flow**: First-time user tutorial explaining E2EE and key setup
- **Notification badges**: Unread message counters on sidebar icons
- **Keyboard shortcuts**: Extended shortcuts beyond Ctrl+K (e.g. Ctrl+N new chat)
- **Drag-and-drop files**: Drag images/files directly into the chat area
- **Accessibility**: ARIA labels, focus management, screen reader support

## 🧪 Testing & DevOps
- **End-to-end tests**: Playwright tests for auth flow, messaging, feed
- **Unit tests**: Jest/Vitest for crypto functions and store logic
- **CI/CD pipeline**: GitHub Actions for lint, test, and deploy to Vercel
- **Error monitoring**: Integrate Sentry or LogRocket for production error tracking
- **Database backups**: Automated Supabase backup schedule

## 🌐 Scalability
- **TURN server**: Deploy Coturn for reliable WebRTC behind symmetric NATs
- **CDN for media**: Serve uploaded images via CDN (Cloudflare, Vercel Edge)
- **Rate limiting**: API rate limiting on message queue and posts
- **Supabase Edge Functions**: Server-side validation for posts and profile updates
