# Advanced Features: Privacy & File Handling

## 1. The "Time Machine" (Message Revocation)
- **Mechanism:** Since messages live on devices, a "Delete for Everyone" action is a control signal, not a database operation.
- **Process:** User A sends a Realtime broadcast (or queues a control message) of type `REVOKE_MSG` with the original `message_id`. User B's device receives this and deletes the record from its local SQLite database.

## 2. Screen Shield (Anti-Capture)
- **Web:** Apply CSS `filter: blur(0)` over a `<canvas>` element drawing the video feed. Simple `user-select: none` does not prevent OS-level screenshots.
- **Mobile Native (React Native):** Use `expo-screen-capture` to call `preventScreenCaptureAsync()`, which implements `FLAG_SECURE` on Android and blanks the screen on iOS app switchers.

## 3. Media & Large File Constraints
- **Images/Audio:** Upload to Supabase Storage, send the URL + decryption key in the `cipher_text`. 
- **Storage Sweeper:** Create a Postgres `pg_cron` extension or Edge Function to run `DELETE FROM storage.objects WHERE created_at < NOW() - INTERVAL '7 days'`. Users must download media within 7 days, or it's gone from the server.