/**
 * Legacy photos: read the metadata already inside people's photos and group
 * them into "moments" worth telling a story about.
 *
 *   readPhotoMeta(file)  → { takenAt, localDate, lat, lon, source }
 *   makeThumb(blob)      → small JPEG Blob (or null if the browser can't decode it)
 *   estimateHome(photos) → { lat, lon } | null   (where most photos are taken)
 *   bucketize(photos, home) → [{ id, kind: 'trip'|'day'|'undated', start, end, photos, km, ... }]
 *
 * Everything runs on-device. Nothing is uploaded, and no maps service is called.
 */
(() => {
  'use strict';

  // ============= EXIF =============
  // Rather than fully parse JPEG segments / HEIC boxes, look for the standard
  // "Exif\0\0" marker followed by a TIFF header. That works for JPEG (APP1) and
  // for the Exif item inside HEIC files.
  const EXIF_MARK = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00];

  function findTiffStart(bytes) {
    outer:
    for (let i = 0; i < bytes.length - 14; i++) {
      for (let k = 0; k < 6; k++) if (bytes[i + k] !== EXIF_MARK[k]) continue outer;
      const t = i + 6;
      const le = bytes[t] === 0x49 && bytes[t + 1] === 0x49 && bytes[t + 2] === 0x2A && bytes[t + 3] === 0x00;
      const be = bytes[t] === 0x4D && bytes[t + 1] === 0x4D && bytes[t + 2] === 0x00 && bytes[t + 3] === 0x2A;
      if (le || be) return t;
    }
    return -1;
  }

  function parseTiff(bytes, t) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const le = bytes[t] === 0x49;
    const u16 = (o) => view.getUint16(t + o, le);
    const u32 = (o) => view.getUint32(t + o, le);
    const inRange = (o, n) => t + o >= 0 && t + o + n <= bytes.length;

    function readIfd(off) {
      const out = {};
      if (!inRange(off, 2)) return out;
      const count = u16(off);
      for (let i = 0; i < count; i++) {
        const e = off + 2 + i * 12;
        if (!inRange(e, 12)) break;
        const tag = u16(e), type = u16(e + 2), n = u32(e + 4);
        const size = ({ 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 })[type] || 1;
        const valOff = size * n <= 4 ? e + 8 : u32(e + 8);
        if (!inRange(valOff, size * n)) continue;
        if (type === 2) {
          let s = '';
          for (let j = 0; j < n; j++) { const c = bytes[t + valOff + j]; if (!c) break; s += String.fromCharCode(c); }
          out[tag] = s;
        } else if (type === 3) out[tag] = u16(valOff);
        else if (type === 4) out[tag] = u32(valOff);
        else if (type === 5 || type === 10) {
          const arr = [];
          for (let j = 0; j < n; j++) {
            const num = u32(valOff + j * 8), den = u32(valOff + j * 8 + 4);
            arr.push(den ? num / den : 0);
          }
          out[tag] = arr;
        } else if (type === 1 || type === 7) out[tag] = bytes.subarray(t + valOff, t + valOff + n);
      }
      return out;
    }

    const ifd0 = readIfd(u32(4));
    const exif = ifd0[0x8769] ? readIfd(ifd0[0x8769]) : {};
    const gps = ifd0[0x8825] ? readIfd(ifd0[0x8825]) : {};
    return { ifd0, exif, gps };
  }

  function dmsToDeg(dms, ref) {
    if (!Array.isArray(dms) || dms.length < 3) return null;
    let deg = dms[0] + dms[1] / 60 + dms[2] / 3600;
    if (ref === 'S' || ref === 'W') deg = -deg;
    return Number.isFinite(deg) ? deg : null;
  }

  // "2024:06:03 14:22:10" (+ optional "+02:00") → { takenAt, localDate }
  function parseExifDate(s, offset) {
    const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s || '');
    if (!m) return null;
    const [, y, mo, d, h, mi, se] = m;
    if (+y < 1826 || +mo < 1 || +mo > 12 || +d < 1 || +d > 31) return null;
    let takenAt;
    if (offset && /^[+-]\d{2}:\d{2}$/.test(offset)) {
      takenAt = Date.parse(`${y}-${mo}-${d}T${h}:${mi}:${se}${offset}`);
    } else {
      takenAt = new Date(+y, +mo - 1, +d, +h, +mi, +se).getTime();
    }
    if (!Number.isFinite(takenAt)) return null;
    // localDate is the wall-clock date where the photo was taken: what people remember.
    return { takenAt, localDate: `${y}-${mo}-${d}` };
  }

  function localDateOf(ms) {
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  async function readPhotoMeta(file) {
    const result = { takenAt: null, localDate: null, lat: null, lon: null, source: 'none' };
    try {
      const HEAD = 512 * 1024;
      let bytes = new Uint8Array(await file.slice(0, HEAD).arrayBuffer());
      let t = findTiffStart(bytes);
      // HEIC often keeps Exif after the image data; fall back to the whole file.
      if (t < 0 && file.size > HEAD && file.size < 60 * 1024 * 1024) {
        bytes = new Uint8Array(await file.arrayBuffer());
        t = findTiffStart(bytes);
      }
      if (t >= 0) {
        const { ifd0, exif, gps } = parseTiff(bytes, t);
        const when = parseExifDate(exif[0x9003] || exif[0x9004] || ifd0[0x0132], exif[0x9011] || exif[0x9010]);
        if (when) Object.assign(result, when, { source: 'exif' });
        const lat = dmsToDeg(gps[2], gps[1]);
        const lon = dmsToDeg(gps[4], gps[3]);
        if (lat !== null && lon !== null && !(lat === 0 && lon === 0) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
          result.lat = lat; result.lon = lon;
        }
      }
    } catch (err) {
      console.warn('EXIF read failed for', file.name, err);
    }
    if (!result.takenAt && file.lastModified) {
      // A file's modified time is a weak guess (iOS often sets it to "now"), so mark it.
      result.takenAt = file.lastModified;
      result.localDate = localDateOf(file.lastModified);
      result.source = 'file';
    }
    return result;
  }

  // ============= THUMBNAILS =============
  function loadImage(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
      img.src = url;
    });
  }
  async function makeThumb(blob, maxPx = 360) {
    try {
      const img = await loadImage(blob);
      const scale = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      return await new Promise(res => canvas.toBlob(b => res(b), 'image/jpeg', 0.8));
    } catch {
      return null;  // e.g. HEIC on a browser that can't decode it
    }
  }

  // ============= GROUPING =============
  function distanceKm(a, b) {
    const R = 6371, toRad = (x) => x * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }
  const hasGeo = (p) => p.lat != null && p.lon != null;

  /** Home = the ~5 km grid cell holding the most photos (needs a few to be sure). */
  function estimateHome(photos) {
    const cells = new Map();
    for (const p of photos) {
      if (!hasGeo(p)) continue;
      const key = `${Math.round(p.lat * 20)}:${Math.round(p.lon * 20)}`;
      const c = cells.get(key) || { n: 0, lat: 0, lon: 0 };
      c.n++; c.lat += p.lat; c.lon += p.lon;
      cells.set(key, c);
    }
    let best = null;
    for (const c of cells.values()) if (!best || c.n > best.n) best = c;
    if (!best || best.n < 3) return null;
    return { lat: best.lat / best.n, lon: best.lon / best.n, photos: best.n };
  }

  function centerOf(photos) {
    const g = photos.filter(hasGeo);
    if (!g.length) return null;
    return { lat: g.reduce((s, p) => s + p.lat, 0) / g.length, lon: g.reduce((s, p) => s + p.lon, 0) / g.length };
  }

  const HOUR = 3600 * 1000;
  const EVENT_GAP = 3 * HOUR;      // a pause longer than this starts a new moment
  const EVENT_JUMP_KM = 25;        // ...as does moving this far between shots
  const AWAY_KM = 50;              // farther than this from home counts as "away"
  const TRIP_GAP = 48 * HOUR;      // away-moments this close together form one trip

  /**
   * Group photos into stories:
   *  - 'trip'    consecutive moments away from home (>50 km), merged across days
   *  - 'day'     everything else, one bucket per calendar day
   *  - 'undated' photos with no usable date
   */
  function bucketize(photos, home) {
    const dated = photos.filter(p => p.takenAt).sort((a, b) => a.takenAt - b.takenAt);
    const undated = photos.filter(p => !p.takenAt);

    // 1. moments: runs of photos without big time gaps or location jumps
    const events = [];
    for (const p of dated) {
      const ev = events[events.length - 1];
      const prev = ev && ev.photos[ev.photos.length - 1];
      const split = !prev
        || p.takenAt - prev.takenAt > EVENT_GAP
        || (hasGeo(p) && hasGeo(prev) && distanceKm(p, prev) > EVENT_JUMP_KM);
      if (split) events.push({ photos: [p] });
      else ev.photos.push(p);
    }
    for (const ev of events) {
      ev.start = ev.photos[0].takenAt;
      ev.end = ev.photos[ev.photos.length - 1].takenAt;
      ev.center = centerOf(ev.photos);
      ev.km = home && ev.center ? distanceKm(home, ev.center) : null;
      ev.away = ev.km != null && ev.km > AWAY_KM;
    }

    // 2. merge: away moments → trips, home moments → days
    const buckets = [];
    for (const ev of events) {
      const last = buckets[buckets.length - 1];
      if (ev.away) {
        if (last && last.kind === 'trip' && ev.start - last.end <= TRIP_GAP) {
          last.photos.push(...ev.photos); last.end = ev.end; last.kmMax = Math.max(last.kmMax, ev.km);
        } else {
          buckets.push({ kind: 'trip', photos: [...ev.photos], start: ev.start, end: ev.end, kmMax: ev.km });
        }
      } else {
        const day = ev.photos[0].localDate || localDateOf(ev.start);
        if (last && last.kind === 'day' && last.day === day) {
          last.photos.push(...ev.photos); last.end = ev.end;
        } else {
          buckets.push({ kind: 'day', day, photos: [...ev.photos], start: ev.start, end: ev.end });
        }
      }
    }
    if (undated.length) buckets.push({ kind: 'undated', photos: undated, start: null, end: null });

    for (const b of buckets) {
      b.id = 'b_' + b.photos[0].id;
      b.center = centerOf(b.photos);
      b.km = b.kind === 'trip' ? Math.round(b.kmMax) : null;
      b.startDate = b.photos[0].localDate || (b.start ? localDateOf(b.start) : null);
      b.endDate = b.photos[b.photos.length - 1].localDate || (b.end ? localDateOf(b.end) : null);
      b.guessedDates = b.photos.every(p => p.source !== 'exif');
    }
    return buckets.sort((a, b) => (b.start || 0) - (a.start || 0));
  }

  // ============= LABELS =============
  function fmt(iso, opts) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', opts);
  }
  function bucketTitle(b) {
    if (b.kind === 'undated') return 'Photos without a date';
    if (b.kind === 'day') return fmt(b.startDate, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    if (b.startDate === b.endDate) return 'A day away · ' + fmt(b.startDate, { month: 'long', day: 'numeric', year: 'numeric' });
    const sameYear = b.startDate.slice(0, 4) === b.endDate.slice(0, 4);
    const sameMonth = sameYear && b.startDate.slice(5, 7) === b.endDate.slice(5, 7);
    const a = fmt(b.startDate, { month: 'short', day: 'numeric' });
    const z = sameMonth ? fmt(b.endDate, { day: 'numeric' }) : fmt(b.endDate, { month: 'short', day: 'numeric' });
    return `A trip · ${a}–${z}, ${b.endDate.slice(0, 4)}`;
  }
  function bucketSubtitle(b) {
    const n = b.photos.length;
    const parts = [`${n} ${n === 1 ? 'photo' : 'photos'}`];
    if (b.km != null) parts.push(b.km < 1000 ? `about ${b.km} km from home` : `about ${Math.round(b.km / 100) * 100} km from home`);
    if (b.guessedDates && b.kind !== 'undated') parts.push('date estimated');
    return parts.join(' · ');
  }
  function mapsUrl(center) {
    return center ? `https://maps.apple.com/?ll=${center.lat.toFixed(5)},${center.lon.toFixed(5)}&q=Here` : null;
  }

  window.LegacyPhotos = {
    readPhotoMeta, makeThumb, estimateHome, bucketize, bucketTitle, bucketSubtitle,
    distanceKm, mapsUrl, parseExifDate, findTiffStart, parseTiff,
  };
})();
