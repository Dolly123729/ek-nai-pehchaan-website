# BYUH Admissions RAG Chatbot (This Project Only)

This project is now configured for BYUH Admissions website data only (`https://admissions.byuh.edu/`).

## Step 1. Open This Project Folder

```bash
cd ek-nai-pehchaan-app
```

## Step 2. Create Your `.env`

Copy `.env.example` to `.env` and fill your real keys:

```env
OPENAI_API_KEY=...
DATABASE_URL=postgresql://.../...
NEXT_PUBLIC_CHAT_API_BASE=http://localhost:3001
```

Important:
- `DATABASE_URL` must be plain value (do not write `DATABASE_URL='DATABASE_URL=...'`).

## Step 3. Install Packages

```bash
npm install
```

## Step 4. Run Database Migration

```bash
npm run migrate
```

This creates:
- `byuh_chunks`
- `sessions`
- `conversations`
- `chat_messages`
- `pgvector` extension + vector index

## Step 5. Ingest BYUH Admissions Content

Option A (recommended SOP flow, script):

```bash
npm run ingest
```

Option B (server endpoint):

```powershell
Invoke-RestMethod -Method Post `
  -Uri "http://localhost:3001/ingest/byuh" `
  -ContentType "application/json" `
  -Body "{}"
```

## Step 6. Start Chat API Server

```bash
npm run chat-server
```

Endpoints:
- `GET /health`
- `POST /ingest/byuh`
- `POST /chat`

## Step 7. Start Frontend

In a second terminal:

```bash
npm run dev
```

Open:
- `http://localhost:3000`

## Step 8. Test

Ask admissions questions and verify answers include source URLs from `admissions.byuh.edu`.
