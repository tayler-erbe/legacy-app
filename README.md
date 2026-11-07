# Legacy

*A memory for later.* A private vault for the stories you'd want someone to hear
someday: a photo, a voice recording, a few paragraphs about what happened that
day.

Legacy is an installable Progressive Web App. Everything stays on your device.
Nothing is uploaded, and there's no account.

## What it does

- **Capture a memory**: a photo, title, date (exact or "around June 1987"), a
  voice recording, the written story, who was there, and tags. Any one of these
  is enough.
- **"What do you feel like sharing today?"** A new memory starts by asking:
  someone specific ("If you could tell Sarah something on her hardest day…"),
  everyday me, a story about me, family & roots, what I believe, advice, or
  gratitude & repair. The prompts are based on palliative-care research
  ([`docs/PROMPT_RESEARCH.md`](docs/PROMPT_RESEARCH.md)). Every one is
  optional.
- **Your camera roll, with your stories**: bring in photos and Legacy groups
  them into days and trips using the date and place saved inside each photo,
  all on-device. Pick a moment, scroll through the photos, add a note to any
  of them ("that's our dog in the background, the day we brought her home"),
  and tell the story. Moments from today's date in past years show up with
  *"Would you like to tell this story?"*
- **Gentle follow-up questions** after you tell a story, to help fill in the
  picture. Answer any, or skip them all.
- **Speak instead of type**: record your voice (kept exactly as you said it),
  or use *Speak to type* to turn speech into text.
- **Just me / Family / Anyone** on every memory. The **family edition** archive
  leaves out anything private, ready to hand on.
- **Find it again**: search across titles, stories, people and tags. Tap a
  person or tag on a memory to see every memory with them.
- **On this day**: memories from today's date in earlier years show up at the
  top of the list.
- **Family questions**: share an "ask me" link. Family type a question, and
  it comes back to you as a link that opens Legacy with their question ready
  to answer, credited to them.
- **An archive that outlives the app**: download everything as a `.zip`.
  Unzip it and open `index.html` to read every story, with photos and
  recordings, in any browser, forever. No app or account. The same file
  restores into Legacy on any device. The app reminds you when memories pile
  up without a backup.
- **A legacy plan**: say who the stories are for, where your archive lives,
  and whether AI may ever be used with them. Print a one-page letter for your
  family that explains how to open everything.
- **Weekly reminder**: one tap adds a recurring "tell one story" event to your
  calendar.
- **Works offline** and installs to the home screen on iOS and Android.

## Running it

There's no build step. Serve the folder over HTTP. Service workers need
`http://localhost` or HTTPS, so opening `index.html` as a file won't work.

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>. Microphone recording needs a secure context
(localhost or HTTPS).

Pushing to `main` deploys to GitHub Pages via `.github/workflows/pages.yml`.

## Testing

`tests/e2e.js` drives the real app in a headless browser through capture,
search, photo import and grouping, the guided prompts, family questions,
archives (full and family edition), restore, and offline mode. It makes about
90 checks. With the app served on port 8765:

```bash
node tests/e2e.js
```

It needs Playwright with Chromium, and Python 3 with Pillow, which generates
test photos with real EXIF dates and GPS (`tests/genphotos.py`).

## Project layout

| Path                    | What |
|-------------------------|------|
| `index.html`            | Markup for every screen and modal. |
| `app.js`                | App logic: IndexedDB storage, rendering, capture, search, questions, import, legacy plan. |
| `archive.js`            | Zero-dependency zip writer/reader and the offline book generator. |
| `photos.js`             | On-device EXIF reader, thumbnails, and day/trip grouping. |
| `prompts.js`            | The prompt library, follow-up questions, and occasions. |
| `styles.css`            | Styles. Design tokens live in `:root`. |
| `service-worker.js`     | Offline support. Network-first for the app, cache-first for fonts. |
| `manifest.webmanifest`  | PWA install metadata. |
| `icons/`                | App icons. |
| `docs/ARCHITECTURE.md`  | Design principles and the roadmap (backend, AI chat, launch). |
| `docs/EXPORT_FORMAT.md` | The versioned archive format. |
| `docs/COMPETITIVE_LANDSCAPE.md` | Market research and where Legacy can win. |
| `docs/PROMPT_RESEARCH.md` | The bereavement and palliative-care research behind the prompts. |

## Your data

Memories live in the browser's IndexedDB on this device. The app asks the
browser to mark that storage as persistent. Still, browsers (Safari especially)
can clear site data under storage pressure, and deleting the app from your home
screen deletes its data. **Keep a recent backup somewhere safe.**

The archive format is documented in [`docs/EXPORT_FORMAT.md`](docs/EXPORT_FORMAT.md).
The archive is plain HTML, JSON, and media files, so your memories stay readable
even if this app disappears.

## Roadmap

Stage 1 (this repo) is the on-device MVP. Next is a native iPhone app that can
notice trips in your camera roll and gently ask about them. After that come a
sync backend, transcription, and the "Talk to me" chat, which tells your
stories back in your own voice, only with your consent. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
