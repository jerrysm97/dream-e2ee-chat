# 🔐 Dream E2EE Chat

**End-to-End Encrypted Messaging Platform**

A privacy-first chat application with true end-to-end encryption. Messages are encrypted client-side before leaving the browser — the server never sees plaintext.

![Next.js](https://img.shields.io/badge/Next.js-App_Router-000?logo=next.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?logo=typescript&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Backend-3ECF8E?logo=supabase&logoColor=white)
![E2EE](https://img.shields.io/badge/Security-E2E_Encrypted-critical)

---

## 🚀 Features

- **True E2EE** — AES-GCM encryption with client-side key derivation
- **Zero-knowledge server** — Supabase stores only ciphertext
- **Real-time messaging** — Supabase Realtime subscriptions
- **QA test suite** — Automated crypto cycle verification
- **Modern UI** — Tailwind CSS with responsive design

## 📁 Architecture

```
dream-e2ee-chat/
├── app/                 # Next.js App Router pages
├── components/          # React UI components
├── hooks/               # Custom React hooks
├── lib/                 # Crypto engine & utilities
├── store/               # State management (Zustand)
├── supabase/            # Database schema & migrations
├── test_crypto.js       # Cryptographic unit tests
└── qa_e2ee_cycle.mjs    # Full encryption cycle QA
```

## 🔒 How Encryption Works

```
Sender                          Server                         Receiver
  │                               │                               │
  ├─ Derive shared key (ECDH) ────┤                               │
  ├─ Encrypt msg (AES-GCM) ──────┤                               │
  │                               ├─ Store ciphertext only ───────┤
  │                               │                               ├─ Derive shared key
  │                               │                               ├─ Decrypt msg (AES-GCM)
```

## ⚡ Quick Start

```bash
git clone https://github.com/jerrysm97/dream-e2ee-chat.git
cd dream-e2ee-chat
npm install
cp .env.example .env.local   # Add your Supabase keys
npm run dev
```

## 🛠️ Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Framework** | Next.js 14 (App Router) |
| **Language** | TypeScript (strict mode) |
| **Database** | Supabase (PostgreSQL + Realtime) |
| **Crypto** | Web Crypto API (AES-GCM, ECDH) |
| **Styling** | Tailwind CSS |
| **State** | Zustand |

## 📜 License

MIT License
