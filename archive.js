/**
 * Legacy archive: zero-dependency ZIP writer/reader + the offline "book".
 *
 * An archive is a plain .zip that anyone can open without this app:
 *
 *   legacy-archive-YYYY-MM-DD/
 *     index.html      ← a readable book of every memory (static HTML, no JS, no network)
 *     memories.json   ← machine-readable records (see docs/EXPORT_FORMAT.md)
 *     images/<id>.<ext>
 *     audio/<id>.<ext>
 *     README.txt
 *
 * Files are STORED (not compressed): photos and audio are already compressed,
 * and it keeps the writer tiny and the format trivially recoverable.
 */
(() => {
  'use strict';

  // ============= MIME <-> extension =============
  const EXT_BY_MIME = {
    'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/gif': 'gif',
    'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif', 'image/avif': 'avif',
    'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/mpeg': 'mp3',
    'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/x-wav': 'wav',
  };
  const MIME_BY_EXT = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
    heic: 'image/heic', heif: 'image/heif', avif: 'image/avif',
    m4a: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/aac', mp3: 'audio/mpeg',
    webm: 'audio/webm', ogg: 'audio/ogg', wav: 'audio/wav',
  };
  function extForMime(mime, fallback) {
    const base = String(mime || '').split(';')[0].trim().toLowerCase();
    return EXT_BY_MIME[base] || fallback;
  }
  function mimeForPath(path) {
    const ext = String(path).split('.').pop().toLowerCase();
    return MIME_BY_EXT[ext] || 'application/octet-stream';
  }

  // ============= CRC32 =============
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function dosDateTime(d) {
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
    const date = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    return { time, date };
  }

  /**
   * Build a ZIP (store method) from [{ name, data }] where data is a string,
   * Uint8Array, or Blob. Returns a Blob.
   */
  async function buildZip(files) {
    const enc = new TextEncoder();
    const { time, date } = dosDateTime(new Date());
    const parts = [];
    const central = [];
    let offset = 0;

    for (const f of files) {
      let bytes;
      if (typeof f.data === 'string') bytes = enc.encode(f.data);
      else if (f.data instanceof Uint8Array) bytes = f.data;
      else bytes = new Uint8Array(await f.data.arrayBuffer());

      const name = enc.encode(f.name);
      const crc = crc32(bytes);
      const size = bytes.length;

      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);        // version needed
      local.setUint16(6, 0x0800, true);    // flags: UTF-8 names
      local.setUint16(8, 0, true);         // method: store
      local.setUint16(10, time, true);
      local.setUint16(12, date, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, size, true);
      local.setUint32(22, size, true);
      local.setUint16(26, name.length, true);
      local.setUint16(28, 0, true);
      parts.push(local.buffer, name, bytes);

      const cen = new DataView(new ArrayBuffer(46));
      cen.setUint32(0, 0x02014b50, true);
      cen.setUint16(4, 20, true);          // version made by
      cen.setUint16(6, 20, true);          // version needed
      cen.setUint16(8, 0x0800, true);
      cen.setUint16(10, 0, true);
      cen.setUint16(12, time, true);
      cen.setUint16(14, date, true);
      cen.setUint32(16, crc, true);
      cen.setUint32(20, size, true);
      cen.setUint32(24, size, true);
      cen.setUint16(28, name.length, true);
      cen.setUint16(30, 0, true);          // extra
      cen.setUint16(32, 0, true);          // comment
      cen.setUint16(34, 0, true);          // disk
      cen.setUint16(36, 0, true);          // internal attrs
      cen.setUint32(38, 0, true);          // external attrs
      cen.setUint32(42, offset, true);
      central.push(cen.buffer, name);

      offset += 30 + name.length + size;
    }

    const cdSize = central.reduce((n, p) => n + (p.byteLength !== undefined ? p.byteLength : p.length), 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true);
    end.setUint32(16, offset, true);

    return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
  }

  /**
   * Read a ZIP. Returns Map<name, () => Promise<Uint8Array>>.
   * Supports stored entries, and deflated ones where DecompressionStream exists
   * (so a user who unzips, edits, and re-zips the archive can still restore it).
   */
  async function readZip(blob) {
    const buf = new Uint8Array(await blob.arrayBuffer());
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const dec = new TextDecoder();

    let eocd = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
      if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Not a zip file');

    const count = view.getUint16(eocd + 10, true);
    let p = view.getUint32(eocd + 16, true);
    const entries = new Map();

    for (let i = 0; i < count; i++) {
      if (view.getUint32(p, true) !== 0x02014b50) throw new Error('Corrupt zip directory');
      const method = view.getUint16(p + 10, true);
      const csize = view.getUint32(p + 20, true);
      const nameLen = view.getUint16(p + 28, true);
      const extraLen = view.getUint16(p + 30, true);
      const commentLen = view.getUint16(p + 32, true);
      const localOffset = view.getUint32(p + 42, true);
      const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
      p += 46 + nameLen + extraLen + commentLen;
      if (name.endsWith('/')) continue;

      entries.set(name, async () => {
        const lNameLen = view.getUint16(localOffset + 26, true);
        const lExtraLen = view.getUint16(localOffset + 28, true);
        const start = localOffset + 30 + lNameLen + lExtraLen;
        const raw = buf.subarray(start, start + csize);
        if (method === 0) return raw;
        if (method === 8 && typeof DecompressionStream !== 'undefined') {
          const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
          return new Uint8Array(await new Response(stream).arrayBuffer());
        }
        throw new Error(`Unsupported compression in ${name}`);
      });
    }
    return entries;
  }

  // ============= The offline book =============
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
  function storyHtml(story) {
    return String(story || '').split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
      .map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('\n');
  }
  function bookDate(m) {
    if (!m.date) return 'Undated';
    const [y, mo, d] = m.date.split('-').map(Number);
    const dt = new Date(y, mo - 1, d);
    return m.dateApproximate
      ? 'Around ' + dt.toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
      : dt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }
  const AI_WISHES = {
    archive: 'Archive only. Please never use AI with these stories.',
    grounded: 'Family may ask questions, answered only with my own recordings and words. Never invent things I didn\'t say.',
  };

  /** memories: records with optional .image / .audio relative paths. */
  function bookHtml({ name, exportedAt, memories, plan }) {
    const owner = name ? `${name}'s stories` : 'Stories';
    const exported = new Date(exportedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const toc = memories.map((m, i) =>
      `<li><a href="#m${i}"><span class="toc-date">${esc(bookDate(m))}</span> ${esc(m.title || 'Untitled')}</a></li>`).join('\n');

    const body = memories.map((m, i) => {
      const people = (m.peopleTags || []).map(esc).join(', ');
      const tags = (m.generalTags || []).map(t => `<span class="tag">${esc(t)}</span>`).join(' ');
      const asked = m.prompt && m.prompt !== m.title
        ? `<p class="prompt">${m.askedBy ? `${esc(m.askedBy)} asked: ` : ''}${esc(m.prompt)}</p>`
        : (m.askedBy ? `<p class="prompt">Asked by ${esc(m.askedBy)}</p>` : '');
      return `
<article class="memory" id="m${i}">
  <div class="date">${esc(bookDate(m))}</div>
  <h2>${esc(m.title || 'Untitled')}</h2>
  ${asked}
  ${m.image ? `<img src="${esc(m.image)}" alt="${esc(m.title || '')}">` : ''}
  ${m.audio ? `<audio controls preload="none" src="${esc(m.audio)}"></audio><p class="file-note">Recording: <a href="${esc(m.audio)}">${esc(m.audio)}</a></p>` : ''}
  <div class="story">${storyHtml(m.story)}</div>
  ${people ? `<p class="meta"><strong>With</strong> ${people}</p>` : ''}
  ${tags ? `<p class="meta">${tags}</p>` : ''}
</article>`;
    }).join('\n');

    const planBits = [];
    if (plan && plan.recipients) planBits.push(`<p><strong>For:</strong> ${esc(plan.recipients)}</p>`);
    if (plan && AI_WISHES[plan.aiMode]) planBits.push(`<p><strong>My wishes about AI:</strong> ${esc(AI_WISHES[plan.aiMode])}</p>`);

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(owner)}</title>
<style>
  :root { --ink:#0a1628; --paper:#faf6ef; --warm:#f4ecdc; --burnt:#c8541a; --muted:#6b7a90; --line:rgba(10,22,40,.12); }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--paper); color:var(--ink); font-family: Georgia, 'Times New Roman', serif; font-size:18px; line-height:1.7; }
  main { max-width: 680px; margin: 0 auto; padding: 48px 20px 80px; }
  header.cover { text-align:center; padding: 40px 0 32px; border-bottom:1px solid var(--line); margin-bottom: 32px; }
  .eyebrow, .date, .toc-date, .file-note { font-family: ui-monospace, Menlo, Consolas, monospace; font-size:11px; letter-spacing:.15em; text-transform:uppercase; }
  .eyebrow { color:var(--muted); }
  h1 { font-weight:400; font-style:italic; font-size:44px; line-height:1.1; margin:12px 0; }
  .sub { color:var(--muted); font-style:italic; }
  .plan { background:var(--warm); padding:16px 20px; border-radius:4px; font-size:16px; margin: 0 0 32px; }
  .plan p { margin: 4px 0; }
  nav h2 { font-size:14px; font-family: ui-monospace, monospace; letter-spacing:.15em; text-transform:uppercase; color:var(--burnt); }
  nav ol { padding-left: 20px; }
  nav a { color:var(--ink); text-decoration:none; }
  nav a:hover { text-decoration:underline; }
  .toc-date { color:var(--muted); margin-right:6px; }
  .memory { padding: 40px 0; border-top:1px solid var(--line); page-break-inside: avoid; }
  .date { color:var(--burnt); }
  .memory h2 { font-weight:400; font-size:32px; line-height:1.2; margin:8px 0 12px; }
  .prompt { font-style:italic; color:var(--muted); margin: 0 0 16px; }
  img { width:100%; height:auto; border-radius:4px; margin: 8px 0 16px; }
  audio { width:100%; margin: 8px 0 4px; }
  .file-note { color:var(--muted); margin:0 0 16px; }
  .file-note a { color:var(--muted); }
  .meta { font-size:15px; color:var(--muted); }
  .tag { display:inline-block; font-family: ui-monospace, monospace; font-size:11px; letter-spacing:.08em; text-transform:uppercase; background:rgba(10,22,40,.05); padding:2px 8px; margin: 2px 2px 2px 0; }
  footer { margin-top:48px; padding-top:24px; border-top:1px solid var(--line); font-size:14px; color:var(--muted); font-style:italic; }
  @media print { body { background:#fff; } audio, .file-note { display:none; } nav { page-break-after: always; } }
</style>
</head>
<body>
<main>
  <header class="cover">
    <div class="eyebrow">Legacy</div>
    <h1>${esc(owner)}</h1>
    <div class="sub">${memories.length} ${memories.length === 1 ? 'memory' : 'memories'} · saved ${esc(exported)}</div>
  </header>
  ${planBits.length ? `<section class="plan">${planBits.join('\n')}</section>` : ''}
  <nav>
    <h2>Contents</h2>
    <ol>
${toc}
    </ol>
  </nav>
${body}
  <footer>
    This book was exported from Legacy. It needs no app, account, or internet connection.
    Photos are in the <em>images</em> folder and recordings in the <em>audio</em> folder.
    <em>memories.json</em> holds everything in a machine-readable form.
  </footer>
</main>
</body>
</html>
`;
  }

  function readmeText(name, count) {
    return [
      `${name ? name + "'s" : 'Your'} Legacy archive: ${count} ${count === 1 ? 'memory' : 'memories'}.`,
      '',
      'HOW TO READ IT',
      '  Open index.html in any web browser. No app, account, or internet needed.',
      '',
      "WHAT'S INSIDE",
      '  index.html     a readable book of every memory',
      '  images/        the original photos',
      '  audio/         the original voice recordings',
      '  memories.json  every memory as structured data (for restoring or moving to another tool)',
      '',
      'TO RESTORE INTO LEGACY',
      '  Settings → Backup & restore → Restore, then choose this .zip file.',
      '',
      'Keep a copy somewhere safe: cloud storage, a USB drive, or email it to yourself.',
      '',
    ].join('\r\n');
  }

  window.LegacyArchive = { buildZip, readZip, bookHtml, readmeText, extForMime, mimeForPath, crc32, AI_WISHES };
})();
