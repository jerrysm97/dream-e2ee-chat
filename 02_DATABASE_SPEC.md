# Database Schema & Aggressive RLS

## Tables

### `profiles`
- `id`: uuid (PK, references `auth.users` ON DELETE CASCADE)
- `phone_number`: text (unique, hashed if prioritizing security)
- `public_key`: text (temporarily optional for auto-creation on signup)
- `avatar_url`: text

**Note**: A database trigger automatically creates a `profiles` record whenever a new user is inserted into `auth.users`.

### `message_queue` (Replaces persistent `messages`)
- `id`: uuid (PK)
- `recipient_id`: uuid (References `profiles(id)` ON DELETE CASCADE, Indexed for fast lookups)
- `sender_id`: uuid (References `profiles(id)` ON DELETE CASCADE)
- `cipher_text`: text (E2EE payload)
- `created_at`: timestamp (TTL: Auto-delete after 30 days if undelivered)
*(Note: No `conversation_id` needed here, as routing is purely user-to-user based on keys).*

## Security: Row Level Security (RLS)
- **Rule 1:** `profiles` - Anyone authenticated can read (to find friends), only owner can update.
- **Rule 2:** `message_queue` - `INSERT` allowed if authenticated. `SELECT` and `DELETE` ONLY allowed where `auth.uid() = recipient_id`. (A user can only pull down and clear their own pending messages).

## Storage Optimization Strategy
Do not store chat history in the cloud. You have a 500MB DB limit. 1 million text messages = ~200MB. If you store history, you will hit the paywall in months.