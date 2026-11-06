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

  const SCHEMA_VERSION = '1.2';
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
    activeTab: 'memories',
    query: '',
  };

  function freshDraft() {
    return {
      image: null, audio: null, audioMime: null,
      removeImage: false, removeAudio: false,
      prompt: null,
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
    renderBackupStatus();
    showModal('settingsModal');
  }
  function closeSettings() { hideModal('settingsModal'); }

  async function applySettings() {
    state.settings.name = state.settingsDraft.name.trim();
    state.settings.avatar = state.settingsDraft.avatar;
    try {
      await saveSettings(state.settings);
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

  function showPromptSuggestion() {
    $('promptText').textContent = PROMPTS[promptIndex % PROMPTS.length];
  }
  function shufflePrompt() {
    let next = promptIndex;
    while (PROMPTS.length > 1 && next === promptIndex) next = Math.floor(Math.random() * PROMPTS.length);
    promptIndex = next;
    showPromptSuggestion();
  }
  function renderPromptState() {
    const pinned = !!state.draft.prompt;
    $('promptPinned').hidden = !pinned;
    $('promptPinnedText').textContent = state.draft.prompt || '';
    // Only offer suggestions on brand-new memories.
    $('promptCard').hidden = pinned || !!state.editing;
  }
  $('promptShuffle').addEventListener('click', shufflePrompt);
  $('promptUse').addEventListener('click', () => {
    state.draft.prompt = PROMPTS[promptIndex % PROMPTS.length];
    renderPromptState();
    $('storyInput').focus();
  });
  $('promptUnpin').addEventListener('click', () => {
    state.draft.prompt = null;
    renderPromptState();
  });

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
    showPromptSuggestion();
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
      html += `<p class="detail-prompt">${escapeHtml(m.prompt)}</p>`;
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

  // ============= EXPORT =============
  async function exportAll() {
    if (state.memories.length === 0) {
      toast('No memories to export');
      return;
    }
    toast('Preparing backup…');
    const exportedAt = Date.now();
    const payload = {
      format: 'legacy-export',
      schema_version: SCHEMA_VERSION,
      exported_at: new Date(exportedAt).toISOString(),
      user: { name: state.settings.name || null },
      description: 'Legacy memory export. Images and audio are base64-encoded inline for portability. See docs/EXPORT_FORMAT.md.',
      memories: []
    };
    for (const m of sortMemories(state.memories)) {
      const out = { ...m };
      if (m.hasImage) {
        const blob = await idbGet(STORE_IMAGES, m.id);
        if (blob) { out.imageData = await blobToBase64(blob); out.imageMime = blob.type || null; }
      }
      if (m.hasAudio) {
        const blob = await idbGet(STORE_AUDIO, m.id);
        if (blob) out.audioData = await blobToBase64(blob);
      }
      payload.memories.push(out);
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `legacy-memories-${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Safari needs the URL alive briefly after click.
    setTimeout(() => URL.revokeObjectURL(url), 4000);

    state.meta.lastExportAt = exportedAt;
    try { await saveMeta(state.meta); } catch (err) { console.error(err); }
    renderBackupBanner();
    if (isOpen('settingsModal')) renderBackupStatus();
    toast(`Exported ${plural(payload.memories.length, 'memory', 'memories')}`);
  }

  // ============= IMPORT =============
  async function importFile(file) {
    let payload;
    try {
      payload = JSON.parse(await file.text());
    } catch {
      toast("That file isn't a Legacy backup");
      return;
    }
    const incoming = payload && Array.isArray(payload.memories) ? payload.memories : null;
    if (!incoming) {
      toast("That file isn't a Legacy backup");
      return;
    }

    let added = 0, updated = 0, skipped = 0, failed = 0;
    for (const raw of incoming) {
      try {
        if (!raw || typeof raw !== 'object') { failed++; continue; }
        const { imageData, audioData, imageMime, ...rec } = raw;
        rec.id = typeof rec.id === 'string' && rec.id ? rec.id : uuid();

        const existing = await loadMemory(rec.id);
        const incomingUpdated = rec.updated || rec.created || 0;
        if (existing && (existing.updated || existing.created || 0) >= incomingUpdated) {
          skipped++;
          continue;
        }

        const imageBlob = typeof imageData === 'string' ? dataUrlToBlob(imageData) : null;
        const audioBlob = typeof audioData === 'string' ? dataUrlToBlob(audioData) : null;

        const memory = {
          id: rec.id,
          schema_version: SCHEMA_VERSION,
          userId: rec.userId || 'local_user',
          title: rec.title || 'Untitled',
          date: rec.date || null,
          dateApproximate: !!rec.dateApproximate,
          story: rec.story || '',
          prompt: rec.prompt || null,
          peopleTags: Array.isArray(rec.peopleTags) ? rec.peopleTags : [],
          generalTags: Array.isArray(rec.generalTags) ? rec.generalTags : [],
          hasImage: !!imageBlob,
          hasAudio: !!audioBlob,
          audioMime: audioBlob ? (rec.audioMime || audioBlob.type || null) : null,
          preview: rec.preview || (rec.story ? String(rec.story).slice(0, 160) : ''),
          created: rec.created || Date.now(),
          updated: incomingUpdated || Date.now(),
          synced: false,
        };

        if (imageBlob) await idbPut(STORE_IMAGES, memory.id, imageBlob);
        else await idbDel(STORE_IMAGES, memory.id);
        if (audioBlob) await idbPut(STORE_AUDIO, memory.id, audioBlob);
        else await idbDel(STORE_AUDIO, memory.id);
        await saveMemory(memory);
        invalidateThumb(memory.id);
        existing ? updated++ : added++;
      } catch (err) {
        console.error('Import failed for record', raw && raw.id, err);
        failed++;
      }
    }

    // Adopt the backup's name if this device doesn't have one yet.
    if (!state.settings.name && payload.user && payload.user.name) {
      state.settings.name = String(payload.user.name);
      try { await saveSettings(state.settings); } catch {}
      $('nameInput').value = state.settings.name;
      state.settingsDraft.name = state.settings.name;
      applyPersonalization();
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
    toast(parts.length ? `Restore: ${parts.join(', ')}` : 'Backup was empty');
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
    if ($('welcomeBackdrop').classList.contains('open')) { dismissWelcome(); return; }
    closeAll();
  });

  // ============= INIT =============
  (async () => {
    try {
      await openDB();
      state.settings = await loadSettings();
      state.meta = await loadMeta();
      state.memories = await loadAllMemories();
      applyPersonalization();
      refreshDatalists();
      await renderList();
      showWelcomeIfFirstTime();
      if (state.memories.length) requestPersistence();
    } catch (err) {
      console.error('Init failed', err);
      toast('Storage init failed');
    }
  })();

})();
