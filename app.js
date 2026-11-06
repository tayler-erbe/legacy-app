/**
 * Legacy — a memory vault PWA.
 *
 * Storage:
 *   IndexedDB "legacy_memories":
 *     - "memories" store: keyed by memory.id
 *     - "images" store: keyed by memory.id, holds Blob
 *     - "audio" store: keyed by memory.id, holds Blob
 *     - "settings" store: keyed by setting key
 *         "user": { name, avatar }            — personalization
 *         "meta": { lastExportAt }            — backup bookkeeping
 *         "questions": [{ id, text, from, askedAt, answeredBy }] — family "ask me" questions
 *         "plan": { recipients, backupLocation, aiMode } — the user's legacy plan
 *
 *   localStorage:
 *     - "legacy_welcome_seen": "1" once the user has dismissed the welcome screen
 *
 * Every memory record carries a userId field (currently "local_user") so the
 * schema is multi-tenant-ready for the backend phase. The export format is
 * documented in docs/EXPORT_FORMAT.md — keep the two in sync.
 */
(() => {
  'use strict';

  const SCHEMA_VERSION = '2.0';
  const BACKUP_NUDGE_THRESHOLD = 5;   // unbacked memories before we nudge
  const AVATAR_MAX_PX = 320;

  // ============= STORAGE =============

  const DB_NAME = 'legacy_memories';
  const DB_VERSION = 2;
  const STORE_MEMORIES = 'memories';
  const STORE_IMAGES = 'images';
  const STORE_AUDIO = 'audio';
  const STORE_SETTINGS = 'settings';

  let db = null;

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const _db = e.target.result;
        if (!_db.objectStoreNames.contains(STORE_MEMORIES)) _db.createObjectStore(STORE_MEMORIES, { keyPath: 'id' });
        if (!_db.objectStoreNames.contains(STORE_IMAGES)) _db.createObjectStore(STORE_IMAGES);
        if (!_db.objectStoreNames.contains(STORE_AUDIO)) _db.createObjectStore(STORE_AUDIO);
        if (!_db.objectStoreNames.contains(STORE_SETTINGS)) _db.createObjectStore(STORE_SETTINGS);
      };
      req.onsuccess = (e) => { db = e.target.result; resolve(db); };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  function idbPut(store, key, value) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      if (store === STORE_MEMORIES) tx.objectStore(store).put(value);
      else tx.objectStore(store).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }
  function idbGet(store, key) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const r = tx.objectStore(store).get(key);
      r.onsuccess = () => resolve(r.result);
      r.onerror = (e) => reject(e.target.error);
    });
  }
  function idbDel(store, key) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }
  function idbGetAll(store) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const r = tx.objectStore(store).getAll();
      r.onsuccess = () => resolve(r.result || []);
      r.onerror = (e) => reject(e.target.error);
    });
  }

  async function loadAllMemories() { return idbGetAll(STORE_MEMORIES); }
  async function loadMemory(id) { return idbGet(STORE_MEMORIES, id); }
  async function saveMemory(mem) { return idbPut(STORE_MEMORIES, null, mem); }
  async function deleteMemoryData(id) {
    try { await idbDel(STORE_MEMORIES, id); } catch {}
    try { await idbDel(STORE_IMAGES, id); } catch {}
    try { await idbDel(STORE_AUDIO, id); } catch {}
  }

  async function loadSettings() {
    try {
      const s = await idbGet(STORE_SETTINGS, 'user');
      return s || { name: '', avatar: null };
    } catch { return { name: '', avatar: null }; }
  }
  async function saveSettings(s) { return idbPut(STORE_SETTINGS, 'user', s); }

  async function loadMeta() {
    try {
      const m = await idbGet(STORE_SETTINGS, 'meta');
      return m || { lastExportAt: null };
    } catch { return { lastExportAt: null }; }
  }
  async function saveMeta(m) { return idbPut(STORE_SETTINGS, 'meta', m); }

  async function loadKey(key, fallback) {
    try {
      const v = await idbGet(STORE_SETTINGS, key);
      return v == null ? fallback : v;
    } catch { return fallback; }
  }
  async function saveKey(key, value) { return idbPut(STORE_SETTINGS, key, value); }

  const DEFAULT_PLAN = { recipients: '', backupLocation: '', aiMode: 'undecided' };

  // Ask the browser not to evict our data under storage pressure.
  // Safari in particular will purge IndexedDB for sites that aren't persisted.
  async function requestPersistence() {
    try {
      if (!navigator.storage || !navigator.storage.persist) return false;
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    } catch { return false; }
  }

  // ============= STATE =============
  const state = {
    memories: [],
    editing: null,
    draft: freshDraft(),
    detailId: null,
    settings: { name: '', avatar: null },
    settingsDraft: { name: '', avatar: null },
    meta: { lastExportAt: null },
    questions: [],
    plan: { ...DEFAULT_PLAN },
    activeTab: 'memories',
    query: '',
  };

  function freshDraft() {
    return {
      image: null, audio: null, audioMime: null,
      removeImage: false, removeAudio: false,
      prompt: null, askedBy: null, questionId: null,
    };
  }

  // ============= OBJECT URLS =============
  // Thumbnails are cached per memory id so re-rendering (e.g. while typing a
  // search) doesn't re-read blobs or leak URLs. Short-lived URLs (detail audio,
  // modal previews) are tracked per surface and revoked when it closes.
  const thumbUrls = new Map();
  const scopedUrls = { detail: [], modal: [] };

  async function thumbUrl(id) {
    if (thumbUrls.has(id)) return thumbUrls.get(id);
    const blob = await idbGet(STORE_IMAGES, id);
    const url = blob ? URL.createObjectURL(blob) : null;
    thumbUrls.set(id, url);
    return url;
  }
  function invalidateThumb(id) {
    const url = thumbUrls.get(id);
    if (url) URL.revokeObjectURL(url);
    thumbUrls.delete(id);
  }
  function scopedUrl(scope, blob) {
    const url = URL.createObjectURL(blob);
    scopedUrls[scope].push(url);
    return url;
  }
  function revokeScope(scope) {
    scopedUrls[scope].forEach(u => URL.revokeObjectURL(u));
    scopedUrls[scope] = [];
  }

  // ============= HELPERS =============
  const $ = (id) => document.getElementById(id);

  function uuid() {
    return 'mem_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }
  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function parseISO(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  function formatDate(iso, approximate = false) {
    if (!iso) return '';
    try {
      const date = parseISO(iso);
      if (approximate) {
        return 'Around ' + date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
      }
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch { return iso; }
  }
  function memoryDateLabel(m) { return formatDate(m.date, m.dateApproximate) || 'undated'; }

  function relativeTime(ts) {
    if (!ts) return '';
    const diff = Date.now() - ts;
    const day = 86400000;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.round(diff / 60000)} min ago`;
    if (diff < day) return `${Math.round(diff / 3600000)} hr ago`;
    if (diff < 2 * day) return 'yesterday';
    if (diff < 30 * day) return `${Math.round(diff / day)} days ago`;
    return new Date(ts).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }
  function formatBytes(n) {
    if (!n && n !== 0) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  }
  function plural(n, one, many) { return `${n} ${n === 1 ? one : many}`; }

  let toastTimer = null;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
  }
  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }
  function dataUrlToBlob(dataUrl) {
    const comma = dataUrl.indexOf(',');
    if (comma < 0) throw new Error('Not a data URL');
    const head = dataUrl.slice(0, comma);
    const body = dataUrl.slice(comma + 1);
    const mime = (head.match(/^data:([^;,]+)/) || [])[1] || 'application/octet-stream';
    if (!/;base64/.test(head)) return new Blob([decodeURIComponent(body)], { type: mime });
    const bin = atob(body);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }
  function escapeHtml(s) {
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // Downscale an image file to a small square-ish JPEG data URL for the avatar.
  function resizeImageToDataUrl(file, maxPx) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = (err) => { URL.revokeObjectURL(url); reject(err); };
      img.src = url;
    });
  }

  // ============= MODAL PLUMBING =============
  const MODALS = ['addModal', 'detailModal', 'aboutModal', 'settingsModal'];

  function showModal(id) {
    $('modalBackdrop').classList.add('open');
    $(id).classList.add('open');
  }
  function hideModal(id) {
    $(id).classList.remove('open');
    if (!MODALS.some(m => $(m).classList.contains('open'))) {
      $('modalBackdrop').classList.remove('open');
    }
  }
  function isOpen(id) { return $(id).classList.contains('open'); }

  // ============= WELCOME =============
  function showWelcomeIfFirstTime() {
    try {
      if (localStorage.getItem('legacy_welcome_seen') === '1') return;
    } catch {}
    $('welcomeBackdrop').classList.add('open');
  }
  function dismissWelcome() {
    $('welcomeBackdrop').classList.remove('open');
    try { localStorage.setItem('legacy_welcome_seen', '1'); } catch {}
  }

  // ============= SETTINGS / PERSONALIZATION =============
  function applyPersonalization() {
    const name = (state.settings.name || '').trim();
    const avatar = state.settings.avatar;

    $('mastheadTitle').textContent = 'A memory for later';
    $('mastheadSubtitle').textContent = name
      ? `Hello, ${name}. Quiet stories, saved in your voice.`
      : 'Quiet stories, saved in your voice.';

    $('chatTitle').textContent = name ? `Talk to ${name}` : 'Talk to me';
    $('navChatLabel').textContent = name ? name.split(' ')[0] : 'Chat';

    const avatarEl = $('chatAvatar');
    const letterEl = $('chatAvatarLetter');
    avatarEl.querySelectorAll('img').forEach(n => n.remove());
    if (avatar) {
      const img = document.createElement('img');
      img.src = avatar;
      img.alt = '';
      avatarEl.appendChild(img);
      letterEl.style.display = 'none';
    } else {
      letterEl.style.display = 'block';
      letterEl.textContent = name ? name.charAt(0).toUpperCase() : 'L';
    }
  }

  function renderAvatarDrop(src) {
    const drop = $('avatarDrop');
    drop.classList.toggle('has-image', !!src);
    drop.querySelectorAll('img').forEach(n => n.remove());
    if (src) {
      const img = document.createElement('img');
      img.src = src;
      img.alt = '';
      drop.appendChild(img);
    }
  }

  async function renderBackupStatus() {
    const last = state.meta.lastExportAt;
    const unbacked = unbackedCount();
    let text = last ? `Last backup ${relativeTime(last)}.` : 'Never backed up.';
    if (state.memories.length) {
      text += unbacked
        ? ` ${plural(unbacked, 'memory', 'memories')} not in a backup yet.`
        : ' Everything is backed up.';
    }
    $('backupStatus').textContent = text;

    const parts = [];
    try {
      if (navigator.storage && navigator.storage.estimate) {
        const { usage } = await navigator.storage.estimate();
        if (usage != null) parts.push(`Using ${formatBytes(usage)} on this device`);
      }
      if (navigator.storage && navigator.storage.persisted) {
        parts.push(await navigator.storage.persisted()
          ? 'protected from automatic cleanup'
          : 'the browser may clear this if space runs low — keep a backup');
      }
    } catch {}
    $('storageStatus').textContent = parts.length ? parts.join(' · ') + '.' : '';
  }

  function openSettings() {
    state.settingsDraft = {
      name: state.settings.name || '',
      avatar: state.settings.avatar || null,
    };
    $('nameInput').value = state.settingsDraft.name;
    renderAvatarDrop(state.settingsDraft.avatar);
    fillPlanForm(state.plan);
    renderBackupStatus();
    showModal('settingsModal');
  }
  function closeSettings() { hideModal('settingsModal'); }

  async function applySettings() {
    state.settings.name = state.settingsDraft.name.trim();
    state.settings.avatar = state.settingsDraft.avatar;
    state.plan = readPlanForm();
    try {
      await saveSettings(state.settings);
      await saveKey('plan', state.plan);
      applyPersonalization();
      closeSettings();
      toast('Settings saved');
    } catch (err) {
      console.error(err);
      toast('Could not save settings');
    }
  }

  $('avatarInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      state.settingsDraft.avatar = await resizeImageToDataUrl(file, AVATAR_MAX_PX);
    } catch {
      state.settingsDraft.avatar = await blobToBase64(file);
    }
    renderAvatarDrop(state.settingsDraft.avatar);
  });

  $('nameInput').addEventListener('input', (e) => {
    state.settingsDraft.name = e.target.value;
  });

  // ============= TAB SWITCHING =============
  function switchTab(tab) {
    state.activeTab = tab;
    document.querySelectorAll('.nav-item').forEach(n => {
      n.classList.toggle('active', n.dataset.tab === tab);
    });
    $('tabMemories').classList.toggle('active', tab === 'memories');
    $('tabChat').classList.toggle('active', tab === 'chat');
    if (tab === 'chat') $('chatMemoryCount').textContent = state.memories.length;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // ============= SEARCH =============
  function haystack(m) {
    return [m.title, m.story, m.prompt, ...(m.peopleTags || []), ...(m.generalTags || []),
      memoryDateLabel(m), m.date && m.date.slice(0, 4)]
      .filter(Boolean).join(' \n ').toLowerCase();
  }
  function matchesQuery(m, query) {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return true;
    const h = haystack(m);
    return terms.every(t => h.includes(t));
  }
  function setQuery(q) {
    state.query = q;
    $('searchInput').value = q;
    $('searchClear').hidden = !q;
    renderList();
  }

  let searchDebounce = null;
  $('searchInput').addEventListener('input', (e) => {
    const v = e.target.value;
    $('searchClear').hidden = !v;
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => { state.query = v.trim(); renderList(); }, 120);
  });
  $('searchClear').addEventListener('click', () => { setQuery(''); $('searchInput').focus(); });

  // ============= SORT =============
  // Dated memories newest-first, then undated ones by when they were created.
  function sortMemories(list) {
    return [...list].sort((a, b) => {
      if (a.date && b.date) return b.date.localeCompare(a.date) || (b.created || 0) - (a.created || 0);
      if (a.date) return -1;
      if (b.date) return 1;
      return (b.created || 0) - (a.created || 0);
    });
  }

  // ============= BACKUP NUDGE =============
  function unbackedCount() {
    const last = state.meta.lastExportAt || 0;
    return state.memories.filter(m => (m.updated || m.created || 0) > last).length;
  }
  function renderBackupBanner() {
    const n = unbackedCount();
    const show = n >= BACKUP_NUDGE_THRESHOLD && !state.query;
    $('backupBanner').hidden = !show;
    if (show) {
      $('backupBannerCount').textContent = n;
      $('backupBannerLabel').textContent = state.meta.lastExportAt
        ? 'memories added or changed since your last backup.'
        : "memories aren't backed up anywhere yet.";
    }
  }

  // ============= ON THIS DAY =============
  function onThisDayMemories() {
    const today = todayISO();
    const md = today.slice(5);
    const year = +today.slice(0, 4);
    return state.memories
      .filter(m => m.date && !m.dateApproximate && m.date.slice(5) === md && +m.date.slice(0, 4) < year)
      .sort((a, b) => a.date.localeCompare(b.date));
  }
  function renderOnThisDay() {
    const el = $('onThisDay');
    const list = state.query ? [] : onThisDayMemories();
    el.hidden = !list.length;
    if (!list.length) { el.innerHTML = ''; return; }
    const year = new Date().getFullYear();
    el.innerHTML = `
      <div class="otd-eyebrow">On this day</div>
      ${list.map(m => {
        const ago = year - +m.date.slice(0, 4);
        return `<button class="otd-item" data-id="${escapeHtml(m.id)}">
          <span class="otd-ago">${plural(ago, 'year', 'years')} ago</span>
          <span class="otd-title">${escapeHtml(m.title || 'Untitled')}</span>
        </button>`;
      }).join('')}`;
    el.querySelectorAll('.otd-item').forEach(b => b.addEventListener('click', () => openDetail(b.dataset.id)));
  }

  // ============= RENDER LIST =============
  let renderToken = 0;

  async function renderList() {
    const token = ++renderToken;
    const el = $('memoryList');
    const total = state.memories.length;

    $('chatMemoryCount').textContent = total;
    $('searchWrap').hidden = total === 0;
    renderBackupBanner();
    renderAskBanner();
    renderOnThisDay();

    if (total === 0) {
      $('memoryCount').textContent = '0';
      $('memoryCountLabel').textContent = 'memories';
      el.innerHTML = `
        <div class="empty-state">
          <div class="big-quote">Start with one small moment.</div>
          <p>A photo. A sentence. The smallest thing you'd want them to know.</p>
          <div class="cta-hint">
            Tap the <strong>+</strong> button to add your first memory.
          </div>
        </div>`;
      return;
    }

    const filtered = sortMemories(state.memories.filter(m => matchesQuery(m, state.query)));
    if (state.query) {
      $('memoryCount').textContent = `${filtered.length} of ${total}`;
      $('memoryCountLabel').textContent = total === 1 ? 'memory' : 'memories';
    } else {
      $('memoryCount').textContent = total;
      $('memoryCountLabel').textContent = total === 1 ? 'memory' : 'memories';
    }

    if (!filtered.length) {
      el.innerHTML = `
        <div class="empty-state empty-search">
          <p>Nothing matches “${escapeHtml(state.query)}”.</p>
          <button class="btn-ghost" id="clearSearchEmpty">Show all memories</button>
        </div>`;
      $('clearSearchEmpty').addEventListener('click', () => setQuery(''));
      return;
    }

    // Resolve thumbnails in parallel before touching the DOM, so a fast typist
    // doesn't see cards from a stale query flash in.
    const thumbs = await Promise.all(filtered.map(m => m.hasImage ? thumbUrl(m.id) : null));
    if (token !== renderToken) return;

    const frag = document.createDocumentFragment();
    filtered.forEach((m, i) => {
      const card = document.createElement('article');
      card.className = 'memory-card';
      card.dataset.id = m.id;
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', m.title || 'Untitled memory');

      const url = thumbs[i];
      const imgHtml = url
        ? `<div class="img-wrap"><img src="${url}" alt="" loading="lazy"></div>`
        : '<div class="img-wrap no-img"></div>';

      const metaTags = (m.peopleTags || []).concat(m.generalTags || []).slice(0, 4)
        .map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('');
      const audioBadge = m.hasAudio ? '<span class="tag tag-audio">♪ voice</span>' : '';

      card.innerHTML = `
        ${imgHtml}
        <div class="card-body">
          <span class="date-tag">${escapeHtml(memoryDateLabel(m))}</span>
          <h3 class="title">${escapeHtml(m.title || 'Untitled')}</h3>
          ${m.preview ? `<p class="preview">${escapeHtml(m.preview)}</p>` : ''}
          ${(metaTags || audioBadge) ? `<div class="meta">${audioBadge}${metaTags}</div>` : ''}
        </div>`;
      card.addEventListener('click', () => openDetail(m.id));
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(m.id); }
      });
      frag.appendChild(card);
    });
    el.innerHTML = '';
    el.appendChild(frag);
  }

  // ============= PROMPTS =============
  const PROMPTS = [
    'What did the house you grew up in smell like?',
    'Who taught you something you still use every day?',
    'What was your first job, and what did you spend the money on?',
    'Describe a meal you wish you could eat one more time.',
    'What is a risk you took that changed everything?',
    'Tell the story of how you met someone who matters to you.',
    'What did a normal Saturday look like when you were ten?',
    'What is something you were wrong about for a long time?',
    'Describe a place you could still walk through with your eyes closed.',
    'What song takes you straight back to a specific moment?',
    'What do you want your grandchildren to know about your parents?',
    'Tell about a time you laughed so hard you couldn’t stop.',
    'What was the hardest year of your life, and what got you through it?',
    'What is a small tradition your family had that no one else did?',
    'Who was your best friend at fifteen? What did you two get up to?',
    'What is the best advice you ever ignored?',
    'Describe the day one of your children was born.',
    'What is something you made with your hands that you were proud of?',
    'Tell about a trip that didn’t go as planned.',
    'What did you believe about adulthood as a kid that turned out to be false?',
    'What is a phrase or saying you picked up from someone you love?',
    'Describe a teacher you will never forget.',
    'What were you doing on a day the whole world remembers?',
    'What would you want to say to yourself at twenty?',
    'Tell about a pet that was part of the family.',
    'What is a decision you’re quietly proud of?',
    'Describe the view from a window you looked out of every day.',
    'What is something you hope never changes about the people you love?',
    'Tell the story behind an object you’ve kept for years.',
    'What does a perfect ordinary day look like for you now?',
  ];
  let promptIndex = Math.floor(Math.random() * PROMPTS.length);

  // The suggestion card shows questions family asked first (newest first),
  // then falls back to the built-in prompts.
  let suggestion = null;  // { kind: 'question', q } | { kind: 'prompt', text }

  function openQuestions() {
    return state.questions.filter(q => !q.answeredBy).sort((a, b) => b.askedAt - a.askedAt);
  }
  function randomPrompt() {
    let next = promptIndex;
    while (PROMPTS.length > 1 && next === promptIndex) next = Math.floor(Math.random() * PROMPTS.length);
    promptIndex = next;
    return { kind: 'prompt', text: PROMPTS[promptIndex] };
  }
  function showSuggestion() {
    if (!suggestion) return;
    const isQ = suggestion.kind === 'question';
    $('promptEyebrow').textContent = isQ
      ? (suggestion.q.from ? `${suggestion.q.from} asked you` : 'Someone asked you')
      : 'Need a starting point?';
    $('promptText').textContent = isQ ? suggestion.q.text : suggestion.text;
    $('promptDismiss').hidden = !isQ;
    $('promptCard').classList.toggle('is-question', isQ);
  }
  function resetSuggestion() {
    const qs = openQuestions();
    suggestion = qs.length ? { kind: 'question', q: qs[0] } : { kind: 'prompt', text: PROMPTS[promptIndex] };
    showSuggestion();
  }
  function nextSuggestion() {
    const qs = openQuestions();
    if (suggestion && suggestion.kind === 'question') {
      const i = qs.findIndex(q => q.id === suggestion.q.id);
      if (i >= 0 && i + 1 < qs.length) { suggestion = { kind: 'question', q: qs[i + 1] }; showSuggestion(); return; }
    }
    suggestion = randomPrompt();
    showSuggestion();
  }
  function pinQuestion(q) {
    state.draft.prompt = q.text;
    state.draft.askedBy = q.from || null;
    state.draft.questionId = q.id;
    renderPromptState();
  }
  function renderPromptState() {
    const pinned = !!state.draft.prompt;
    $('promptPinned').hidden = !pinned;
    $('promptPinnedText').textContent = state.draft.prompt || '';
    $('promptPinnedFrom').hidden = !state.draft.askedBy;
    $('promptPinnedFrom').textContent = state.draft.askedBy ? `${state.draft.askedBy} asked` : '';
    // Only offer suggestions on brand-new memories.
    $('promptCard').hidden = pinned || !!state.editing;
  }
  $('promptShuffle').addEventListener('click', nextSuggestion);
  $('promptUse').addEventListener('click', () => {
    if (!suggestion) return;
    if (suggestion.kind === 'question') pinQuestion(suggestion.q);
    else {
      state.draft.prompt = suggestion.text;
      state.draft.askedBy = null;
      state.draft.questionId = null;
      renderPromptState();
    }
    $('storyInput').focus();
  });
  $('promptDismiss').addEventListener('click', async () => {
    if (!suggestion || suggestion.kind !== 'question') return;
    if (!confirm('Remove this question? It won\'t be shown again.')) return;
    await removeQuestion(suggestion.q.id);
    resetSuggestion();
    renderAskBanner();
  });
  $('promptUnpin').addEventListener('click', () => {
    state.draft.prompt = null;
    state.draft.askedBy = null;
    state.draft.questionId = null;
    renderPromptState();
  });

  // ============= FAMILY QUESTIONS ("ask me" links) =============
  const MAX_QUESTION = 500;
  const MAX_FROM = 60;

  function appUrl() { return location.origin + location.pathname; }

  async function saveQuestions() {
    try { await saveKey('questions', state.questions); } catch (err) { console.error(err); }
  }
  async function addQuestion(text, from) {
    text = String(text || '').trim().slice(0, MAX_QUESTION);
    from = String(from || '').trim().slice(0, MAX_FROM) || null;
    if (!text) return null;
    const dupe = state.questions.find(q => q.text === text && (q.from || null) === from);
    if (dupe) return dupe;
    const q = { id: 'q_' + uuid().slice(4), text, from, askedAt: Date.now(), answeredBy: null };
    state.questions.push(q);
    await saveQuestions();
    return q;
  }
  async function removeQuestion(id) {
    state.questions = state.questions.filter(q => q.id !== id);
    await saveQuestions();
  }
  async function markAnswered(id, memoryId) {
    const q = state.questions.find(x => x.id === id);
    if (!q) return;
    q.answeredBy = memoryId;
    await saveQuestions();
  }

  function renderAskBanner() {
    const qs = openQuestions();
    const show = qs.length > 0 && !state.query;
    $('askBanner').hidden = !show;
    if (!show) return;
    const q = qs[0];
    $('askBannerFrom').textContent = qs.length > 1
      ? `${qs.length} questions from family are waiting`
      : `${q.from || 'Someone'} asked you`;
    $('askBannerQ').textContent = `“${q.text}”`;
  }
  $('askBannerBtn').addEventListener('click', async () => {
    const q = openQuestions()[0];
    if (!q) return;
    await openModal();
    pinQuestion(q);
  });

  async function shareLink(url, title, text) {
    if (navigator.share) {
      try { await navigator.share({ title, text, url }); return 'shared'; }
      catch (err) { if (err && err.name === 'AbortError') return 'cancelled'; }
    }
    try { await navigator.clipboard.writeText(url); toast('Link copied'); return 'copied'; }
    catch { window.prompt('Copy this link:', url); return 'shown'; }
  }

  async function inviteFamily() {
    const name = (state.settings.name || $('nameInput').value || '').trim();
    if (!name) {
      toast('Add your name in Settings first');
      if (!isOpen('settingsModal')) openSettings();
      $('nameInput').focus();
      return;
    }
    const url = `${appUrl()}?askme=${encodeURIComponent(name)}`;
    await shareLink(url, `Ask ${name} a question`,
      `I'm saving my stories in Legacy. What would you like to ask me? Send me a question here:`);
  }
  $('inviteBtn').addEventListener('click', inviteFamily);
  $('inviteFromChatBtn').addEventListener('click', inviteFamily);

  // --- composer shown to a family member who opened an ?askme= link
  const ASK_IDEAS = [
    'How did you and Dad meet?',
    'What was your first job?',
    'What were you like at my age?',
    'What do you wish someone had told you sooner?',
  ];
  let askTarget = '';

  function openAskComposer(name) {
    askTarget = String(name || '').trim().slice(0, MAX_FROM);
    const who = askTarget || 'them';
    $('askEyebrow').textContent = askTarget ? `A question for ${askTarget}` : 'A question for later';
    $('askTitle').textContent = `What do you want to ask ${who}?`;
    $('askQuestion').value = '';
    $('askForm').hidden = false;
    $('askSent').hidden = true;
    $('askIdeas').innerHTML = ASK_IDEAS.map(i => `<button type="button" class="ask-idea">${escapeHtml(i)}</button>`).join('');
    $('askIdeas').querySelectorAll('.ask-idea').forEach(b => b.addEventListener('click', () => {
      $('askQuestion').value = b.textContent;
      $('askQuestion').focus();
    }));
    try { $('askFrom').value = localStorage.getItem('legacy_ask_from') || ''; } catch {}
    $('askBackdrop').classList.add('open');
  }
  function closeAskComposer() { $('askBackdrop').classList.remove('open'); }

  $('askSend').addEventListener('click', async () => {
    const q = $('askQuestion').value.trim().slice(0, MAX_QUESTION);
    const from = $('askFrom').value.trim().slice(0, MAX_FROM);
    if (!q) { toast('Type a question first'); $('askQuestion').focus(); return; }
    try { localStorage.setItem('legacy_ask_from', from); } catch {}
    const params = new URLSearchParams({ ask: q });
    if (from) params.set('from', from);
    const url = `${appUrl()}?${params.toString()}`;
    $('askLink').value = url;
    $('askForm').hidden = true;
    $('askSent').hidden = false;
    await shareLink(url, `A question from ${from || 'family'}`,
      `${from ? from + ' has' : "I've"} a question for your Legacy: "${q}"`);
  });
  $('askCopy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('askLink').value); toast('Link copied'); }
    catch { $('askLink').select(); }
  });
  $('askAnother').addEventListener('click', () => openAskComposer(askTarget));
  $('askOwn').addEventListener('click', () => { closeAskComposer(); showWelcomeIfFirstTime(); });

  // Handle ?askme= and ?ask= on load. Returns true if the welcome screen should be skipped.
  async function handleIncomingLink() {
    const params = new URLSearchParams(location.search);
    const askme = params.get('askme');
    const ask = params.get('ask');
    if (askme === null && !ask) return false;
    try { history.replaceState(null, '', appUrl()); } catch {}

    if (askme !== null) {
      openAskComposer(askme);
      return true;
    }
    const q = await addQuestion(ask, params.get('from'));
    if (!q) return false;
    try { localStorage.setItem('legacy_welcome_seen', '1'); } catch {}
    renderAskBanner();
    if (!q.answeredBy) {
      await openModal();
      pinQuestion(q);
      toast(q.from ? `${q.from} asked you a question` : 'You have a new question');
    }
    return true;
  }

  // ============= WEEKLY REMINDER (.ics) =============
  function icsEscape(s) { return String(s).replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n'); }
  function icsStamp(d, utc) {
    const p = (n) => String(n).padStart(2, '0');
    return utc
      ? `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
      : `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}00`;
  }
  function downloadReminder() {
    // Next Sunday, 7pm local (floating time, so it follows the user's time zone).
    const start = new Date();
    start.setDate(start.getDate() + ((7 - start.getDay()) % 7 || 7));
    start.setHours(19, 0, 0, 0);
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Legacy//Weekly reminder//EN', 'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      `UID:legacy-weekly-${Date.now()}@legacy`,
      `DTSTAMP:${icsStamp(new Date(), true)}`,
      `DTSTART:${icsStamp(start, false)}`,
      'DURATION:PT15M',
      'RRULE:FREQ=WEEKLY',
      `SUMMARY:${icsEscape('Tell one story in Legacy')}`,
      `DESCRIPTION:${icsEscape('Ten minutes, one memory. Open Legacy: ' + appUrl())}`,
      `URL:${appUrl()}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape('Tell one story in Legacy')}`, 'TRIGGER:PT0M', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR', '',
    ];
    downloadBlob(new Blob([lines.join('\r\n')], { type: 'text/calendar' }), 'legacy-weekly-reminder.ics');
    toast('Open the file to add it to your calendar');
  }
  $('reminderBtn').addEventListener('click', downloadReminder);

  // ============= ADD/EDIT MEMORY MODAL =============
  async function openModal(editingId = null) {
    state.editing = editingId;
    state.draft = freshDraft();
    revokeScope('modal');
    $('modalTitle').textContent = editingId ? 'Edit memory' : 'New memory';
    $('saveBtn').textContent = editingId ? 'Save changes' : 'Save memory';

    $('titleInput').value = '';
    $('dateInput').value = todayISO();
    $('dateApproxInput').checked = false;
    $('storyInput').value = '';
    $('peopleInput').value = '';
    $('tagInput').value = '';
    $('peopleTags').innerHTML = '';
    $('generalTags').innerHTML = '';
    resetPhoto();
    resetAudio();
    resetSuggestion();
    renderPromptState();

    showModal('addModal');
    $('addModal').scrollTop = 0;

    if (!editingId) return;
    const m = await loadMemory(editingId);
    if (!m || state.editing !== editingId) return;
    $('titleInput').value = m.title || '';
    $('dateInput').value = m.date || '';
    $('dateApproxInput').checked = !!m.dateApproximate;
    $('storyInput').value = m.story || '';
    (m.peopleTags || []).forEach(addPersonChip);
    (m.generalTags || []).forEach(addGeneralTagChip);
    state.draft.prompt = m.prompt || null;
    state.draft.askedBy = m.askedBy || null;
    renderPromptState();
    if (m.hasImage) {
      const blob = await idbGet(STORE_IMAGES, editingId);
      if (blob && state.editing === editingId) showPhoto(scopedUrl('modal', blob));
    }
    if (m.hasAudio) {
      const blob = await idbGet(STORE_AUDIO, editingId);
      if (blob && state.editing === editingId) showAudio(scopedUrl('modal', blob));
    }
  }

  function closeModal() {
    cancelRecording();
    hideModal('addModal');
    $('audioPlayback').pause();
    state.editing = null;
    state.draft = freshDraft();
    revokeScope('modal');
  }

  // ============= ABOUT MODAL =============
  function openAbout() { showModal('aboutModal'); }
  function closeAbout() { hideModal('aboutModal'); }

  // ============= PHOTO =============
  function resetPhoto() {
    const drop = $('photoDrop');
    drop.classList.remove('has-image');
    drop.querySelectorAll('img, .photo-replace-hint').forEach(n => n.remove());
    $('removePhotoBtn').hidden = true;
  }
  function showPhoto(url) {
    const drop = $('photoDrop');
    drop.classList.add('has-image');
    drop.querySelectorAll('img, .photo-replace-hint').forEach(n => n.remove());
    const img = document.createElement('img');
    img.src = url;
    img.alt = '';
    drop.appendChild(img);
    const hint = document.createElement('div');
    hint.className = 'photo-replace-hint';
    hint.textContent = 'Tap to replace';
    drop.appendChild(hint);
    $('removePhotoBtn').hidden = false;
  }
  $('photoInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    state.draft.image = file;
    state.draft.removeImage = false;
    showPhoto(scopedUrl('modal', file));
  });
  $('removePhotoBtn').addEventListener('click', () => {
    state.draft.image = null;
    state.draft.removeImage = true;
    resetPhoto();
  });

  // ============= AUDIO =============
  let mediaRecorder = null;
  let audioChunks = [];
  let recordTimer = null;
  let recordStartedAt = 0;
  let discardRecording = false;

  function fmtDuration(ms) {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
  function resetAudio() {
    $('audioPreview').classList.remove('show');
    $('audioPlayback').removeAttribute('src');
    $('audioPlayback').load();
    $('recordLabel').textContent = 'Tap to record';
    $('recordBtn').classList.remove('recording');
  }
  function showAudio(url) {
    $('audioPreview').classList.add('show');
    $('audioPlayback').src = url;
    $('recordLabel').textContent = 'Re-record';
  }
  function stopRecordTimer() {
    clearInterval(recordTimer);
    recordTimer = null;
  }
  function cancelRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      discardRecording = true;
      mediaRecorder.stop();
    }
    stopRecordTimer();
  }

  async function toggleRecord() {
    const btn = $('recordBtn');
    const label = $('recordLabel');

    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      return;
    }
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      toast('Recording not supported here');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunks = [];
      discardRecording = false;
      let mime = '';
      for (const m of ['audio/mp4', 'audio/webm', 'audio/ogg']) {
        if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) { mime = m; break; }
      }
      mediaRecorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      const chosenMime = mediaRecorder.mimeType || mime || 'audio/webm';

      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); };
      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        stopRecordTimer();
        btn.classList.remove('recording');
        if (discardRecording) { discardRecording = false; return; }
        const blob = new Blob(audioChunks, { type: chosenMime });
        state.draft.audio = blob;
        state.draft.audioMime = chosenMime;
        state.draft.removeAudio = false;
        showAudio(scopedUrl('modal', blob));
      };

      mediaRecorder.start();
      recordStartedAt = Date.now();
      btn.classList.add('recording');
      label.textContent = 'Stop · 0:00';
      recordTimer = setInterval(() => {
        label.textContent = `Stop · ${fmtDuration(Date.now() - recordStartedAt)}`;
      }, 500);
    } catch (err) {
      toast('Microphone access denied');
      console.error(err);
    }
  }
  $('recordBtn').addEventListener('click', toggleRecord);
  $('removeAudioBtn').addEventListener('click', () => {
    state.draft.audio = null;
    state.draft.audioMime = null;
    state.draft.removeAudio = true;
    resetAudio();
  });

  // ============= TAGS =============
  function addChip(containerId, value) {
    if (!value) return;
    const container = $(containerId);
    const exists = [...container.querySelectorAll('.tag-chip')]
      .some(c => c.dataset.value.toLowerCase() === value.toLowerCase());
    if (exists) return;
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'tag-chip';
    chip.dataset.value = value;
    chip.setAttribute('aria-label', `Remove ${value}`);
    chip.innerHTML = `${escapeHtml(value)} <span class="remove" aria-hidden="true">×</span>`;
    chip.addEventListener('click', () => chip.remove());
    container.appendChild(chip);
  }
  function addPersonChip(name) {
    if (name && name.trim()) addChip('peopleTags', name.trim());
  }
  function addGeneralTagChip(tag) {
    if (tag && tag.trim()) addChip('generalTags', tag.trim().toLowerCase());
  }
  function getChipValues(containerId) {
    return [...$(containerId).querySelectorAll('.tag-chip')].map(c => c.dataset.value);
  }
  // Pull any text still sitting in the tag inputs, so "typed but didn't tap Add" isn't lost.
  function flushTagInputs() {
    $('peopleInput').value.split(',').forEach(addPersonChip);
    $('peopleInput').value = '';
    $('tagInput').value.split(',').forEach(addGeneralTagChip);
    $('tagInput').value = '';
  }

  // Suggest names/tags the user has already used.
  function refreshDatalists() {
    const people = new Set(), tags = new Set();
    state.memories.forEach(m => {
      (m.peopleTags || []).forEach(p => people.add(p));
      (m.generalTags || []).forEach(t => tags.add(t));
    });
    const fill = (id, values) => {
      $(id).innerHTML = [...values].sort().map(v => `<option value="${escapeHtml(v)}"></option>`).join('');
    };
    fill('peopleList', people);
    fill('tagList', tags);
  }

  $('addPersonBtn').addEventListener('click', () => {
    const input = $('peopleInput');
    input.value.split(',').forEach(addPersonChip);
    input.value = '';
    input.focus();
  });
  $('peopleInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); $('addPersonBtn').click(); }
  });
  $('addTagBtn').addEventListener('click', () => {
    const input = $('tagInput');
    input.value.split(',').forEach(addGeneralTagChip);
    input.value = '';
    input.focus();
  });
  $('tagInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); $('addTagBtn').click(); }
  });

  // ============= SAVE MEMORY =============
  let saving = false;

  async function saveMemoryFromForm() {
    if (saving) return;
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      toast('Stop the recording first');
      return;
    }
    flushTagInputs();

    const title = $('titleInput').value.trim();
    const date = $('dateInput').value;
    const story = $('storyInput').value.trim();
    const peopleTags = getChipValues('peopleTags');
    const generalTags = getChipValues('generalTags');
    const wasEditing = !!state.editing;
    const id = state.editing || uuid();
    const existing = wasEditing ? await loadMemory(id) : null;

    const hasImage = !!state.draft.image || (!state.draft.removeImage && !!(existing && existing.hasImage));
    const hasAudio = !!state.draft.audio || (!state.draft.removeAudio && !!(existing && existing.hasAudio));

    if (!title && !story && !hasImage && !hasAudio) {
      toast('Add a title, story, photo, or recording');
      return;
    }

    const memory = {
      id,
      schema_version: SCHEMA_VERSION,
      userId: 'local_user',
      title: title || (state.draft.prompt ? state.draft.prompt : 'Untitled'),
      date: date || null,
      dateApproximate: !!date && $('dateApproxInput').checked,
      story,
      prompt: state.draft.prompt || null,
      askedBy: state.draft.prompt ? (state.draft.askedBy || null) : null,
      peopleTags,
      generalTags,
      hasImage,
      hasAudio,
      audioMime: hasAudio ? (state.draft.audioMime || (existing && existing.audioMime) || null) : null,
      preview: story ? story.slice(0, 160) : '',
      created: existing ? existing.created : Date.now(),
      updated: Date.now(),
      synced: false,
    };

    saving = true;
    $('saveBtn').disabled = true;
    try {
      if (state.draft.image) await idbPut(STORE_IMAGES, id, state.draft.image);
      else if (!hasImage) await idbDel(STORE_IMAGES, id);
      if (state.draft.audio) await idbPut(STORE_AUDIO, id, state.draft.audio);
      else if (!hasAudio) await idbDel(STORE_AUDIO, id);
      await saveMemory(memory);
      invalidateThumb(id);
      if (state.draft.questionId) await markAnswered(state.draft.questionId, id);

      const isFirst = state.memories.length === 0;
      state.memories = await loadAllMemories();
      refreshDatalists();
      closeModal();
      await renderList();
      toast(wasEditing ? 'Memory updated' : 'Memory saved');
      if (isFirst) requestPersistence();
    } catch (err) {
      console.error(err);
      toast(err && err.name === 'QuotaExceededError' ? 'Out of storage space' : 'Save failed');
    } finally {
      saving = false;
      $('saveBtn').disabled = false;
    }
  }

  // ============= DETAIL =============
  async function openDetail(id) {
    const m = await loadMemory(id);
    if (!m) return;
    state.detailId = id;
    revokeScope('detail');

    let html = '';
    html += `<span class="detail-date">${escapeHtml(memoryDateLabel(m))}</span>`;
    html += `<h1 class="detail-title">${escapeHtml(m.title)}</h1>`;

    if (m.prompt && m.prompt !== m.title) {
      html += `<p class="detail-prompt">${m.askedBy ? `${escapeHtml(m.askedBy)} asked: ` : ''}${escapeHtml(m.prompt)}</p>`;
    } else if (m.askedBy) {
      html += `<p class="detail-prompt">Asked by ${escapeHtml(m.askedBy)}</p>`;
    }

    if (m.hasImage) {
      const url = await thumbUrl(id);
      if (url) html += `<img class="detail-img" src="${url}" alt="">`;
    }

    if (m.hasAudio) {
      const blob = await idbGet(STORE_AUDIO, id);
      if (blob) html += `<audio controls preload="metadata" src="${scopedUrl('detail', blob)}"></audio>`;
    }

    if (m.story) html += `<div class="detail-story">${escapeHtml(m.story)}</div>`;

    const people = m.peopleTags || [];
    const tags = m.generalTags || [];
    if (people.length || tags.length) {
      html += '<div class="detail-meta">';
      if (people.length) {
        html += `<div class="detail-meta-row"><span class="detail-meta-label">With</span>${people.map(t =>
          `<button class="tag tag-link" data-q="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join('')}</div>`;
      }
      if (tags.length) {
        html += `<div class="detail-meta-row"><span class="detail-meta-label">Tags</span>${tags.map(t =>
          `<button class="tag tag-link" data-q="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join('')}</div>`;
      }
      html += '</div>';
    }

    if (m.updated && m.created && m.updated - m.created > 60000) {
      html += `<p class="detail-footnote">Saved ${escapeHtml(relativeTime(m.created))} · edited ${escapeHtml(relativeTime(m.updated))}</p>`;
    } else if (m.created) {
      html += `<p class="detail-footnote">Saved ${escapeHtml(relativeTime(m.created))}</p>`;
    }

    const content = $('detailContent');
    content.innerHTML = html;
    content.querySelectorAll('.tag-link').forEach(b => b.addEventListener('click', () => {
      closeDetail();
      switchTab('memories');
      setQuery(b.dataset.q);
    }));
    showModal('detailModal');
    $('detailModal').scrollTop = 0;
  }

  function closeDetail() {
    const audio = $('detailContent').querySelector('audio');
    if (audio) audio.pause();
    hideModal('detailModal');
    state.detailId = null;
    revokeScope('detail');
  }

  async function deleteCurrent() {
    if (!state.detailId) return;
    if (!confirm('Delete this memory? This cannot be undone.')) return;
    const id = state.detailId;
    await deleteMemoryData(id);
    invalidateThumb(id);
    state.memories = await loadAllMemories();
    refreshDatalists();
    closeDetail();
    await renderList();
    toast('Memory deleted');
  }

  function editCurrent() {
    if (!state.detailId) return;
    const id = state.detailId;
    closeDetail();
    setTimeout(() => openModal(id), 300);
  }

  // ============= EXPORT (archive .zip) =============
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Safari needs the URL alive briefly after click.
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  let exporting = false;
  async function exportAll() {
    if (exporting) return;
    if (state.memories.length === 0) {
      toast('No memories to export');
      return;
    }
    const A = window.LegacyArchive;
    exporting = true;
    toast('Preparing archive…');
    try {
      const exportedAt = Date.now();
      const folder = `legacy-archive-${todayISO()}`;
      const files = [];
      const records = [];

      for (const m of sortMemories(state.memories)) {
        const rec = { ...m };
        if (m.hasImage) {
          const blob = await idbGet(STORE_IMAGES, m.id);
          if (blob) {
            rec.image = `images/${m.id}.${A.extForMime(blob.type, 'jpg')}`;
            rec.imageMime = blob.type || null;
            files.push({ name: `${folder}/${rec.image}`, data: blob });
          }
        }
        if (m.hasAudio) {
          const blob = await idbGet(STORE_AUDIO, m.id);
          if (blob) {
            rec.audio = `audio/${m.id}.${A.extForMime(blob.type || m.audioMime, 'webm')}`;
            files.push({ name: `${folder}/${rec.audio}`, data: blob });
          }
        }
        records.push(rec);
      }

      const manifest = {
        format: 'legacy-archive',
        schema_version: SCHEMA_VERSION,
        exported_at: new Date(exportedAt).toISOString(),
        user: { name: state.settings.name || null },
        plan: state.plan,
        questions: state.questions,
        description: 'Legacy archive. Media files live alongside this file; see docs/EXPORT_FORMAT.md.',
        memories: records,
      };
      files.unshift(
        { name: `${folder}/index.html`, data: A.bookHtml({ name: state.settings.name, exportedAt, memories: records, plan: state.plan }) },
        { name: `${folder}/memories.json`, data: JSON.stringify(manifest, null, 2) },
        { name: `${folder}/README.txt`, data: A.readmeText(state.settings.name, records.length) },
      );

      const zip = await A.buildZip(files);
      downloadBlob(zip, `${folder}.zip`);

      state.meta.lastExportAt = exportedAt;
      try { await saveMeta(state.meta); } catch (err) { console.error(err); }
      renderBackupBanner();
      if (isOpen('settingsModal')) renderBackupStatus();
      toast(`Archived ${plural(records.length, 'memory', 'memories')}`);
    } catch (err) {
      console.error(err);
      toast('Export failed');
    } finally {
      exporting = false;
    }
  }

  // ============= IMPORT (.zip archive or legacy .json) =============
  async function importFile(file) {
    const A = window.LegacyArchive;
    let payload, getMedia;
    const isZip = /\.zip$/i.test(file.name) || file.type === 'application/zip' || file.type === 'application/x-zip-compressed';

    try {
      if (isZip) {
        const entries = await A.readZip(file);
        const manifestName = [...entries.keys()]
          .filter(n => /(^|\/)memories\.json$/.test(n))
          .sort((a, b) => a.length - b.length)[0];
        if (!manifestName) throw new Error('no memories.json');
        const base = manifestName.slice(0, manifestName.length - 'memories.json'.length);
        payload = JSON.parse(new TextDecoder().decode(await entries.get(manifestName)()));
        const fromPath = async (path) => {
          if (typeof path !== 'string' || !path) return null;
          const get = entries.get(base + path);
          if (!get) return null;
          return new Blob([await get()], { type: A.mimeForPath(path) });
        };
        getMedia = async (rec) => {
          const image = await fromPath(rec.image);
          return {
            image: image && rec.imageMime ? new Blob([image], { type: rec.imageMime }) : image,
            audio: await fromPath(rec.audio),
          };
        };
      } else {
        payload = JSON.parse(await file.text());
        getMedia = async (rec) => ({
          image: typeof rec.imageData === 'string' ? dataUrlToBlob(rec.imageData) : null,
          audio: typeof rec.audioData === 'string' ? dataUrlToBlob(rec.audioData) : null,
        });
      }
    } catch (err) {
      console.error(err);
      toast("That file isn't a Legacy archive");
      return;
    }

    const incoming = payload && Array.isArray(payload.memories) ? payload.memories : null;
    if (!incoming) {
      toast("That file isn't a Legacy archive");
      return;
    }

    let added = 0, updated = 0, skipped = 0, failed = 0;
    for (const raw of incoming) {
      try {
        if (!raw || typeof raw !== 'object') { failed++; continue; }
        const id = typeof raw.id === 'string' && raw.id ? raw.id : uuid();

        const existing = await loadMemory(id);
        const incomingUpdated = raw.updated || raw.created || 0;
        if (existing && (existing.updated || existing.created || 0) >= incomingUpdated) {
          skipped++;
          continue;
        }

        const { image: imageBlob, audio: audioBlob } = await getMedia(raw);
        const memory = {
          id,
          schema_version: SCHEMA_VERSION,
          userId: raw.userId || 'local_user',
          title: raw.title || 'Untitled',
          date: raw.date || null,
          dateApproximate: !!raw.dateApproximate,
          story: raw.story || '',
          prompt: raw.prompt || null,
          askedBy: raw.askedBy || null,
          peopleTags: Array.isArray(raw.peopleTags) ? raw.peopleTags : [],
          generalTags: Array.isArray(raw.generalTags) ? raw.generalTags : [],
          hasImage: !!imageBlob,
          hasAudio: !!audioBlob,
          audioMime: audioBlob ? (raw.audioMime || audioBlob.type || null) : null,
          preview: raw.preview || (raw.story ? String(raw.story).slice(0, 160) : ''),
          created: raw.created || Date.now(),
          updated: incomingUpdated || Date.now(),
          synced: false,
        };

        if (imageBlob) await idbPut(STORE_IMAGES, id, imageBlob);
        else await idbDel(STORE_IMAGES, id);
        if (audioBlob) await idbPut(STORE_AUDIO, id, audioBlob);
        else await idbDel(STORE_AUDIO, id);
        await saveMemory(memory);
        invalidateThumb(id);
        existing ? updated++ : added++;
      } catch (err) {
        console.error('Import failed for record', raw && raw.id, err);
        failed++;
      }
    }

    // Adopt the archive's name / plan if this device doesn't have them yet.
    if (!state.settings.name && payload.user && payload.user.name) {
      state.settings.name = String(payload.user.name);
      try { await saveSettings(state.settings); } catch {}
      $('nameInput').value = state.settings.name;
      state.settingsDraft.name = state.settings.name;
      applyPersonalization();
    }
    if (payload.plan && typeof payload.plan === 'object' && isPlanEmpty(state.plan)) {
      state.plan = { ...DEFAULT_PLAN, ...payload.plan };
      try { await saveKey('plan', state.plan); } catch {}
      if (isOpen('settingsModal')) fillPlanForm(state.plan);
    }
    if (Array.isArray(payload.questions)) {
      let changed = false;
      for (const q of payload.questions) {
        if (!q || !q.id || !q.text) continue;
        const mine = state.questions.find(x => x.id === q.id);
        if (!mine) { state.questions.push({ ...q }); changed = true; }
        else if (q.answeredBy && !mine.answeredBy) { mine.answeredBy = q.answeredBy; changed = true; }
      }
      if (changed) await saveQuestions();
    }

    state.memories = await loadAllMemories();
    refreshDatalists();
    await renderList();
    if (isOpen('settingsModal')) renderBackupStatus();
    if (added + updated > 0) requestPersistence();

    const parts = [];
    if (added) parts.push(`${added} added`);
    if (updated) parts.push(`${updated} updated`);
    if (skipped) parts.push(`${skipped} already here`);
    if (failed) parts.push(`${failed} failed`);
    toast(parts.length ? `Restore: ${parts.join(', ')}` : 'Archive was empty');
  }

  $('importBtn').addEventListener('click', () => $('importInput').click());
  $('importInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    $('importBtn').disabled = true;
    try { await importFile(file); }
    finally { $('importBtn').disabled = false; }
  });

  // ============= LEGACY PLAN =============
  function isPlanEmpty(p) {
    return !p || (!p.recipients && !p.backupLocation && (!p.aiMode || p.aiMode === 'undecided'));
  }
  function fillPlanForm(p) {
    $('planRecipients').value = p.recipients || '';
    $('planLocation').value = p.backupLocation || '';
    const mode = p.aiMode || 'undecided';
    document.querySelectorAll('input[name="planAi"]').forEach(r => { r.checked = r.value === mode; });
  }
  function readPlanForm() {
    const checked = document.querySelector('input[name="planAi"]:checked');
    return {
      recipients: $('planRecipients').value.trim(),
      backupLocation: $('planLocation').value.trim(),
      aiMode: checked ? checked.value : 'undecided',
    };
  }

  function printLetter() {
    const plan = readPlanForm();
    const name = ($('nameInput').value || state.settings.name || '').trim();
    const n = state.memories.length;
    const last = state.meta.lastExportAt
      ? new Date(state.meta.lastExportAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : null;
    const wishes = window.LegacyArchive.AI_WISHES[plan.aiMode];
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    $('printLetter').innerHTML = `
      <div class="letter">
        <div class="letter-eyebrow">Legacy</div>
        <h1>${name ? `${escapeHtml(name)}'s stories` : 'My stories'}</h1>
        <p class="letter-date">${escapeHtml(today)}</p>
        ${plan.recipients ? `<p>For ${escapeHtml(plan.recipients)}.</p>` : ''}
        <p>I've been saving the stories of my life (photos, voice recordings, and the things I wanted you to know) in an app called Legacy. As of today there ${n === 1 ? 'is 1 memory' : `are ${n} memories`}.</p>
        <h2>Where to find them</h2>
        <p>${plan.backupLocation
          ? `My latest archive is kept here: <strong>${escapeHtml(plan.backupLocation)}</strong>.`
          : 'My latest archive is a file named <strong>legacy-archive-(date).zip</strong>. Look in my email, cloud storage, or computer downloads.'}
          ${last ? `I last made one on ${escapeHtml(last)}.` : ''}</p>
        <p>The stories may also still be on my phone, in the Legacy app on the home screen.</p>
        <h2>How to open them</h2>
        <ol>
          <li>Unzip the archive file (double-click it on most computers).</li>
          <li>Open the file called <strong>index.html</strong> in any web browser.</li>
          <li>That's it. You don't need an app, an account, a password, or the internet. Photos are in the <em>images</em> folder and my recordings are in the <em>audio</em> folder.</li>
        </ol>
        ${wishes ? `<h2>My wishes about AI</h2><p>${escapeHtml(wishes)}</p>` : ''}
        <p class="letter-sign">With love,</p>
        <p class="letter-name">${escapeHtml(name || '')}</p>
      </div>`;
    document.body.classList.add('printing');
    const done = () => { document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
    setTimeout(done, 1000);
  }
  $('printLetterBtn').addEventListener('click', printLetter);

  // ============= WIRING =============
  $('fab').addEventListener('click', () => openModal());
  $('closeModal').addEventListener('click', closeModal);
  $('cancelBtn').addEventListener('click', closeModal);
  $('saveBtn').addEventListener('click', saveMemoryFromForm);
  $('closeDetail').addEventListener('click', closeDetail);
  $('deleteBtn').addEventListener('click', deleteCurrent);
  $('editBtn').addEventListener('click', editCurrent);
  $('exportBtn').addEventListener('click', exportAll);
  $('settingsExportBtn').addEventListener('click', exportAll);
  $('backupBannerBtn').addEventListener('click', exportAll);

  $('aboutBtn').addEventListener('click', openAbout);
  $('closeAbout').addEventListener('click', closeAbout);

  $('settingsBtn').addEventListener('click', openSettings);
  $('closeSettings').addEventListener('click', closeSettings);
  $('cancelSettings').addEventListener('click', closeSettings);
  $('saveSettings').addEventListener('click', applySettings);

  $('welcomeCta').addEventListener('click', dismissWelcome);
  $('addFromChatBtn').addEventListener('click', () => {
    switchTab('memories');
    setTimeout(() => openModal(), 200);
  });

  function closeAll() {
    if (isOpen('addModal')) closeModal();
    if (isOpen('detailModal')) closeDetail();
    if (isOpen('aboutModal')) closeAbout();
    if (isOpen('settingsModal')) closeSettings();
  }
  $('modalBackdrop').addEventListener('click', closeAll);

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if ($('askBackdrop').classList.contains('open')) return;  // don't lose a half-typed question
    if ($('welcomeBackdrop').classList.contains('open')) { dismissWelcome(); return; }
    closeAll();
  });

  // ============= INIT =============
  (async () => {
    try {
      await openDB();
      state.settings = await loadSettings();
      state.meta = await loadMeta();
      state.questions = await loadKey('questions', []);
      state.plan = { ...DEFAULT_PLAN, ...(await loadKey('plan', {})) };
      state.memories = await loadAllMemories();
      applyPersonalization();
      refreshDatalists();
      await renderList();
      const handled = await handleIncomingLink();
      if (!handled) showWelcomeIfFirstTime();
      if (state.memories.length) requestPersistence();
    } catch (err) {
      console.error('Init failed', err);
      toast('Storage init failed');
    }
  })();

})();
