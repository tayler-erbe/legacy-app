# Architecture & Roadmap

This document captures the design decisions behind Legacy and the planned path from MVP to real product.

---

## Design principles

1. **The data is always the user's.** Every piece of the system — from the local IndexedDB today to the backend later — is designed so the user can export everything at any time, in a plain readable format, without dependency on this app continuing to exist.

2. **Sustainable over scalable.** A memory vault that outlives the user has to survive decades. Prefer boring tech. Minimize vendor lock-in. Prefer formats that can be read with `less` and a browser.

3. **Capture is sacred.** Nothing about the capture flow should feel like filling out a form. It should feel like sitting down and telling a story.

4. **Multi-tenant-ready, not multi-tenant-live.** The MVP is single-user, but every data structure carries a `userId`. Migrating to real multi-tenant will be an additive change, not a rewrite.

5. **Privacy by default.** Nothing phones home in the MVP. When the backend ships, encryption at rest, per-user isolation, and never training on user data are non-negotiable.

---

## Stage 1: PWA MVP (this repo)

**Goal**: prove the capture experience and let the builder (and a handful of test users) start capturing real memories immediately.

**Stack**:
- Vanilla HTML/CSS/JS, no framework, no build step.
- IndexedDB for structured records + Blob storage.
- Service worker for offline.
- Web Audio API / MediaRecorder for voice capture.

**Scope**:
- Create, read, edit, delete memories.
- Photo, title, date, audio, story, people, tags.
- Full export to JSON.
- iOS Safari install to home screen.

**Intentionally not in scope**:
- Auth, accounts, multi-device sync.
- Transcription (audio is saved as-is; user types the story for now).
- The AI bot.

---

## Stage 2: Backend

**Goal**: move storage off the device so memories survive phone replacements, can be accessed across devices, and become available to the AI layer.

**Planned stack**:
- **API**: Node.js (Fastify) or Python (FastAPI). Leaning Python to match the builder's existing skill set.
- **Database**: PostgreSQL. Single source of truth for structured data.
- **Object storage**: S3-compatible (Backblaze B2 for cost, or AWS S3 for operational simplicity). Images and audio live here, not in the DB.
- **Auth**: email + passkey (WebAuthn). Skip passwords entirely if possible.
- **Hosting**: Fly.io or Railway for the API. Backblaze B2 or Cloudflare R2 for storage.
- **Transcription**: OpenAI Whisper API for audio → text. Server-side only. Never sent to any LLM training pipeline.

**Schema sketch** (multi-tenant from day one):

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE memories (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  date DATE,
  date_approximate BOOLEAN DEFAULT FALSE,
  story TEXT,
  story_transcript TEXT,         -- transcribed version if audio exists
  people_tags TEXT[] DEFAULT '{}',
  general_tags TEXT[] DEFAULT '{}',
  image_key TEXT,                -- S3/R2 object key
  audio_key TEXT,
  audio_mime TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON memories (user_id, date DESC);
CREATE INDEX ON memories USING GIN (people_tags);
CREATE INDEX ON memories USING GIN (general_tags);
```

**Sync model**: the PWA keeps IndexedDB as its source of truth locally, but pushes new/updated memories to the API in the background. Conflicts are resolved last-write-wins per memory. Offline captures queue and sync when online.

---

## Stage 3: The AI bot

**Goal**: a chat interface that answers questions as the user, grounded in their memories and persona.

**Planned approach**:
- LLM: Anthropic's Claude (API) behind an abstraction layer. Swappable to OpenAI or a self-hosted open model later.
- Retrieval: hybrid approach.
  - `persona_core` (compact identity from the separate `persona.json` schema) always loaded in system prompt.
  - Memories retrieved via semantic search over `title + story + tags`. Embedding model: OpenAI `text-embedding-3-small` or the Anthropic-recommended alternative at build time.
  - Recent memories + those matching date/people/tag filters prioritized over raw vector similarity when the question is specific.
- Voice preservation: `voice_samples` injected as few-shot examples when the bot is about to respond in "me" mode.
- Prompt caching: Claude's prompt caching used for the persona core to keep per-turn costs near zero.

**Cost estimate**: at $0.01–$0.10 per conversation turn and 100 turns/month per user, cost per active user is $1–$10/month. Pricing at $10–$20/month subscription gives healthy margins once scale is real.

---

## Stage 4: Launch

**Gating items before opening to others**:
- Terms of service + privacy policy reviewed by a lawyer.
- Abuse reporting and content takedown flow.
- Data deletion workflow (GDPR/CCPA compliance).
- Stripe integration for subscriptions.
- Basic admin dashboard.
- Backup strategy for user data (user-initiated export + automated encrypted backups).
- Succession/legacy access plan: users should be able to designate someone who can access their memories after they're gone.

---

## Data portability — the forever-promise

At every stage, the following must remain true:

- A user can export *everything* they've stored — text, images, audio — as a single downloadable zip.
- The export format is documented, versioned, and human-readable.
- The export works even if the service is shutting down.
- The export includes enough metadata to rebuild the user's timeline from scratch with a different tool.

If this ever stops being true, the project has failed its core promise.
