# Legacy archive format

A Legacy archive is a plain `.zip` named `legacy-archive-YYYY-MM-DD.zip`. It's
designed to outlive the app: unzip it, open `index.html`, and every story is
there. No app, account, or internet connection needed.

```
legacy-archive-2026-11-06/
  index.html      a readable book of every memory (static HTML: no JavaScript, no network)
  memories.json   every memory as structured data: the format described below
  images/         original photos, named <memory id>.<ext>
  audio/          original recordings, named <memory id>.<ext>
  README.txt      plain-text instructions
```

Files are stored without compression, because photos and audio are already
compressed. That keeps the archive recoverable with any zip tool ever made.

The app restores archives from **Settings → Backup & restore → Restore**. It
also accepts zips that have been unzipped and re-zipped (deflate), on browsers
with `DecompressionStream`, and older single-file `.json` backups (format 1.x,
below).

## memories.json (2.0)

| Field            | Type     | Notes |
|------------------|----------|-------|
| `format`         | string   | `"legacy-archive"` |
| `schema_version` | string   | `"2.0"` |
| `exported_at`    | string   | ISO 8601 timestamp. |
| `user`           | object   | `{ "name": string \| null }` |
| `plan`           | object   | The legacy plan: `{ recipients, backupLocation, aiMode }`. `aiMode` is `"undecided"`, `"archive"` (never use AI), or `"grounded"` (answer only from my own recordings and words). |
| `questions`      | array    | Family questions: `{ id, text, from, askedAt, answeredBy }`. `answeredBy` is the memory id that answered it, or null. |
| `description`    | string   | Human-readable note. |
| `memories`       | array    | One object per memory, newest first. See below. |

## Memory record

| Field             | Type            | Notes |
|-------------------|-----------------|-------|
| `id`              | string          | Stable ID, e.g. `mem_lx3k9a_4f2b1c`. Used to merge on restore. |
| `schema_version`  | string          | Version the record was written with. |
| `userId`          | string          | `"local_user"` until accounts exist. |
| `title`           | string          | |
| `date`            | string \| null  | `YYYY-MM-DD`. |
| `dateApproximate` | boolean         | If true, only the month and year are meaningful. |
| `story`           | string          | The written story, verbatim. |
| `prompt`          | string \| null  | The question this memory answers, if any. |
| `askedBy`         | string \| null  | Who asked that question, if it came from a family "ask me" link (2.0+). |
| `peopleTags`      | string[]        | Names of people in the memory. |
| `generalTags`     | string[]        | Lower-cased free-form tags. |
| `hasImage`        | boolean         | |
| `hasAudio`        | boolean         | |
| `image`           | string          | Relative path to the photo, e.g. `images/mem_x.jpg` (2.0+, archive only). |
| `imageMime`       | string \| null  | MIME type of the photo. |
| `audio`           | string          | Relative path to the recording, e.g. `audio/mem_x.m4a` (2.0+, archive only). |
| `audioMime`       | string \| null  | e.g. `audio/mp4`, `audio/webm`. |
| `preview`         | string          | First 160 chars of the story (derived). |
| `created`         | number          | Unix epoch milliseconds. |
| `updated`         | number          | Unix epoch milliseconds. Decides which copy wins on restore. |
| `synced`          | boolean         | Reserved for the backend phase. |

## Restore semantics

- Records are matched by `id`.
- A record that doesn't exist on the device is **added**.
- A record that exists is **replaced only if** the archive's `updated` is newer,
  so restoring the same archive twice is harmless.
- On replace, the photo and audio come from the archive. If the archive copy
  has none, the device copy's media is removed too, so the result matches the
  archive.
- Nothing on the device is deleted just because it's missing from the archive.
- The archive's name and plan are adopted only if the device has none.
  Questions are merged by `id`.

## Older single-file backups (1.x)

Before 2.0, a backup was one `legacy-memories-YYYY-MM-DD.json` file with the
same top-level shape (minus `plan` and `questions`). Media was inline:
`imageData` and `audioData` held `data:<mime>;base64,...` URLs instead of
`image` and `audio` paths. These still restore.

## Version history

- **2.0**: zip archive with an offline `index.html` book and media as real
  files; added `plan`, `questions`, `askedBy`.
- **1.2**: added `format`, `prompt`, `imageMime`; `dateApproximate` became
  user-settable.
- **1.1**: added the `user` block.
- **1.0**: initial format.
