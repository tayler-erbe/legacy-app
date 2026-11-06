# Legacy export format

A Legacy backup is a single UTF-8 JSON file named `legacy-memories-YYYY-MM-DD.json`.
It's meant to be readable without the app. Open it in any text editor and the
stories are right there. Photos and audio are embedded as `data:` URLs, which
any browser can display.

The app can restore any file in this format from **Settings → Backup & restore**.

## Top level

| Field            | Type     | Notes |
|------------------|----------|-------|
| `format`         | string   | Always `"legacy-export"` (added in 1.2). |
| `schema_version` | string   | Version of this format, currently `"1.2"`. |
| `exported_at`    | string   | ISO 8601 timestamp. |
| `user`           | object   | `{ "name": string \| null }` |
| `description`    | string   | Human-readable note about the file. |
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
| `prompt`          | string \| null  | The question the memory answers, if it started from a prompt (1.2+). |
| `peopleTags`      | string[]        | Names of people in the memory. |
| `generalTags`     | string[]        | Lower-cased free-form tags. |
| `hasImage`        | boolean         | |
| `hasAudio`        | boolean         | |
| `audioMime`       | string \| null  | e.g. `audio/mp4`, `audio/webm`. |
| `preview`         | string          | First 160 chars of the story (derived). |
| `created`         | number          | Unix epoch milliseconds. |
| `updated`         | number          | Unix epoch milliseconds. Decides which copy wins on restore. |
| `synced`          | boolean         | Reserved for the backend phase. |
| `imageData`       | string          | Present if there's a photo: `data:<mime>;base64,...` |
| `imageMime`       | string \| null  | MIME type of the photo (1.2+). |
| `audioData`       | string          | Present if there's a recording: `data:<mime>;base64,...` |

## Restore semantics

- Records are matched by `id`.
- A record that doesn't exist on the device is **added**.
- A record that exists is **replaced only if** the backup's `updated` is newer.
  Otherwise it's left alone, so restoring the same file twice is harmless.
- On replace, the photo and audio come from the backup. If the backup copy has
  no `imageData`/`audioData`, the device copy's media is removed too, so the
  result matches the backup exactly.
- Nothing on the device is ever deleted just because it's missing from the backup.
- If the device has no name set, the backup's `user.name` is adopted.

## Version history

- **1.2**: added `format`, `prompt`, `imageMime`. `dateApproximate` is now user-settable.
- **1.1**: added `user` block and the settings store.
- **1.0**: initial format.

Older files restore fine. Missing fields get defaults.
