# UI/UX & State Management

## 1. Local-First Data Layer
- **Architecture:** Do not query Supabase to render the UI. Render purely from the local SQLite database.
- **Optimistic UI:** 1. User types message -> Hit send.
    2. Instantly write to local DB with status `pending_clock_icon`.
    3. Push to Supabase queue.
    4. On success, update local DB to `sent_single_tick`.

## 2. Ephemeral Statuses (Stories)
- Render an array of media objects. 
- The client app must enforce the 24-hour rule locally (don't display statuses older than 24h), while the backend Edge Function deletes the actual files to protect your 1GB free storage limit.

## 3. The VoIP Interface
- Use standard `MediaStream` APIs.
- When a call connects, transition the UI to full screen, but maintain a floating `<Video>` element if the user navigates back to the chat view (using absolute positioning and z-index at the root layout level).




Layer 1: Infrastructure Security (Row Level Security)
The First-Principle: Supabase exposes your database directly to the frontend via an API. If you do not lock it down at the row level, anyone with your public anon key can read every message in the system.

The Mechanism: PostgreSQL Row Level Security (RLS). We must map the authenticated user's JWT (auth.uid()) directly to the rows they are allowed to touch.

Antigravity Execution Prompt:
Open the Agent Manager in Antigravity. Make sure it is set to Planning Mode (so you can review the SQL before it executes), and paste this exact prompt:

"Read the 02_DATABASE_SPEC.md file. Act as a database security expert. Generate the exact PostgreSQL SQL migration script to create the profiles and message_queue tables.

Critically, implement strict Row Level Security (RLS) policies with the following rules:

profiles: Anyone authenticated can read (SELECT). Only the owner (auth.uid() = id) can UPDATE.

message_queue: Anyone authenticated can INSERT (send a message). However, a user can ONLY SELECT and DELETE rows where their auth.uid() matches the recipient_id.

Do not use generic policies. Ensure FORCE ROW LEVEL SECURITY is applied. Output the raw SQL script."

Layer 2: Payload Security (End-to-End Encryption)
The First-Principle: A server is just someone else's computer. The message_queue must never hold plaintext.

The Mechanism: Public-Key Cryptography (Asymmetric Encryption).

Alice generates a Private Key (stays hidden on her device) and a Public Key (uploaded to her Supabase profile).

Bob does the same.

When Alice wants to message Bob, she fetches Bob's Public Key from Supabase, encrypts the message using it, and sends the ciphertext. Only Bob's Private Key can unlock it.

Antigravity Execution Prompt:
Once the database is set up, open a new task in the Agent Manager and use this prompt to build the client-side cryptographic engine:

"Act as a cryptography engineer. In our React/Next.js client environment, create a new utility file named cryptoEngine.ts.

Use the native Web Crypto API (or tweetnacl-js if easier for cross-platform compatibility) to implement a lightweight End-to-End Encryption (E2EE) module. I need three specific functions:

generateKeypair(): Generates an Asymmetric keypair (e.g., X25519 or RSA-OAEP). It should save the private key securely in local device storage and return the public key (which we will later push to Supabase).

encryptPayload(text, recipientPublicKey): Takes a plaintext string and encrypts it specifically for the recipient. Returns a base64 or hex ciphertext string.

decryptPayload(cipherText, myPrivateKey): Reverses the process.

Focus purely on the cryptographic math and typed functions. Do not build UI. Add detailed inline comments explaining the encryption standard chosen and why it is secure."

Architectural Trap to Avoid
Do not let the Antigravity agent try to store the private keys in Supabase. A common mistake developers make when using AI coding assistants is letting the AI "helpfully" sync all data to the cloud database. If the private key leaves the user's local device, the entire premise of E2EE is voided.