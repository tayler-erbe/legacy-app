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
- **Story prompts**: "What did the house you grew up in smell like?" Tap
  *Answer this* to start a memory from a question.
- **Find it again**: search across titles, stories, people and tags. Tap a
  person or tag on a memory to see every memory with them.
- **On this day**: memories from today's date in earlier years show up at the
  top of the list.
- **Back up & restore**: download everything (photos and audio included) as
  one readable JSON file, and restore it on any device from
  *Settings → Backup & restore*. The app reminds you when memories pile up
  without a backup.
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

## Project layout

| Path                    | What |
|-------------------------|------|
| `index.html`            | Markup for every screen and modal. |
| `app.js`                | All app logic: IndexedDB storage, rendering, capture, search, export/import. |
| `styles.css`            | Styles. Design tokens live in `:root`. |
| `service-worker.js`     | Offline support. Network-first for the app, cache-first for fonts. |
| `manifest.webmanifest`  | PWA install metadata. |
| `icons/`                | App icons. |
| `docs/ARCHITECTURE.md`  | Design principles and the roadmap (backend, AI chat, launch). |
| `docs/EXPORT_FORMAT.md` | The versioned backup file format. |

## Your data

Memories live in the browser's IndexedDB on this device. The app asks the
browser to mark that storage as persistent. Still, browsers (Safari especially)
can clear site data under storage pressure, and deleting the app from your home
screen deletes its data. **Keep a recent backup somewhere safe.**

The backup format is documented in [`docs/EXPORT_FORMAT.md`](docs/EXPORT_FORMAT.md),
so your memories stay readable even without this app.

## Roadmap

Stage 1 (this repo) is the on-device MVP. Next come a sync backend, automatic
transcription, and the "Talk to me" chat, which tells your stories back in your
own voice. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
