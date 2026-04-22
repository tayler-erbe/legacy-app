/**
 * Legacy — a memory vault PWA.
 *
 * Storage:
 *   IndexedDB "legacy_memories":
 *     - "memories" store: keyed by memory.id
 *     - "images" store: keyed by memory.id, holds Blob
 *     - "audio" store: keyed by memory.id, holds Blob
 *     - "settings" store: keyed by setting key (e.g. "user")
 *
 *   localStorage:
 *     - "legacy_welcome_seen": "1" once the user has dismissed the welcome screen
 */
(() => {
  'use strict';

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

  // ============= STATE =============
  const state = {
    memories: [],
    editing: null,
    draft: { image: null, audio: null, audioMime: null },
    detailId: null,
    settings: { name: '', avatar: null },
    settingsDraft: { name: '', avatar: null, avatarBlob: null },
    activeTab: 'memories',
  };

  // ============= HELPERS =============
  function uuid() {
    return 'mem_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }
  function todayISO() { return new Date().toISOString().slice(0, 10); }
  function formatDate(iso) {
    if (!iso) return '';
    try {
      const [y, m, d] = iso.split('-');
      const date = new Date(+y, +m - 1, +d);
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch { return iso; }
  }
  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2200);
  }
  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }
  function escapeHtml(s) {
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // ============= WELCOME =============
  function showWelcomeIfFirstTime() {
    try {
      if (localStorage.getItem('legacy_welcome_seen') === '1') return;
    } catch {}
    document.getElementById('welcomeBackdrop').classList.add('open');
  }
  function dismissWelcome() {
    document.getElementById('welcomeBackdrop').classList.remove('open');
    try { localStorage.setItem('legacy_welcome_seen', '1'); } catch {}
  }

  // ============= SETTINGS / PERSONALIZATION =============
  function applyPersonalization() {
    const name = (state.settings.name || '').trim();
    const avatar = state.settings.avatar;

    // Masthead greeting
    const title = document.getElementById('mastheadTitle');
    const subtitle = document.getElementById('mastheadSubtitle');
    if (name) {
      title.textContent = 'A memory for later';
      subtitle.textContent = `Hello, ${name}. Quiet stories, saved in your voice.`;
    } else {
      title.textContent = 'A memory for later';
      subtitle.textContent = 'Quiet stories, saved in your voice.';
    }

    // Chat title + nav label
    const chatTitle = document.getElementById('chatTitle');
    const navChatLabel = document.getElementById('navChatLabel');
    if (name) {
      chatTitle.textContent = `Talk to ${name}`;
      navChatLabel.textContent = name.split(' ')[0];
    } else {
      chatTitle.textContent = 'Talk to me';
      navChatLabel.textContent = 'Chat';
    }

    // Chat avatar
    const avatarEl = document.getElementById('chatAvatar');
    const letterEl = document.getElementById('chatAvatarLetter');
    avatarEl.querySelectorAll('img').forEach(n => n.remove());
    if (avatar) {
      const img = document.createElement('img');
      img.src = avatar;
      avatarEl.appendChild(img);
      letterEl.style.display = 'none';
    } else {
      letterEl.style.display = 'block';
      letterEl.textContent = name ? name.trim().charAt(0).toUpperCase() : 'L';
    }
  }

  function openSettings() {
    state.settingsDraft = {
      name: state.settings.name || '',
      avatar: state.settings.avatar || null,
      avatarBlob: null
    };
    document.getElementById('nameInput').value = state.settingsDraft.name;

    // Reset avatar drop
    const drop = document.getElementById('avatarDrop');
    drop.classList.remove('has-image');
    drop.querySelectorAll('img').forEach(n => n.remove());
    if (state.settingsDraft.avatar) {
      drop.classList.add('has-image');
      const img = document.createElement('img');
      img.src = state.settingsDraft.avatar;
      drop.appendChild(img);
    }

    document.getElementById('modalBackdrop').classList.add('open');
    document.getElementById('settingsModal').classList.add('open');
  }
  function closeSettings() {
    document.getElementById('modalBackdrop').classList.remove('open');
    document.getElementById('settingsModal').classList.remove('open');
  }
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

  document.getElementById('avatarInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    // Store as data URL (small, lets us embed directly in <img>)
    const dataUrl = await blobToBase64(file);
    state.settingsDraft.avatar = dataUrl;
    const drop = document.getElementById('avatarDrop');
    drop.classList.add('has-image');
    drop.querySelectorAll('img').forEach(n => n.remove());
    const img = document.createElement('img');
    img.src = dataUrl;
    drop.appendChild(img);
  });

  document.getElementById('nameInput').addEventListener('input', (e) => {
    state.settingsDraft.name = e.target.value;
  });

  // ============= TAB SWITCHING =============
  function switchTab(tab) {
    state.activeTab = tab;
    document.querySelectorAll('.nav-item').forEach(n => {
      n.classList.toggle('active', n.dataset.tab === tab);
    });
    document.getElementById('tabMemories').classList.toggle('active', tab === 'memories');
    document.getElementById('tabChat').classList.toggle('active', tab === 'chat');

    // Update the chat memory count when switching to chat
    if (tab === 'chat') {
      document.getElementById('chatMemoryCount').textContent = state.memories.length;
    }

    // Scroll to top on tab change
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // ============= RENDER LIST =============
  async function renderList() {
    const el = document.getElementById('memoryList');
    document.getElementById('memoryCount').textContent = state.memories.length;
    document.getElementById('chatMemoryCount').textContent = state.memories.length;

    if (state.memories.length === 0) {
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

    const sorted = [...state.memories].sort((a, b) => {
      if (a.date && b.date) return b.date.localeCompare(a.date);
      return (b.created || 0) - (a.created || 0);
    });

    el.innerHTML = '';
    for (const m of sorted) {
      const card = document.createElement('div');
      card.className = 'memory-card';
      card.dataset.id = m.id;

      let imgHtml = '<div class="img-wrap no-img"></div>';
      if (m.hasImage) {
        const blob = await idbGet(STORE_IMAGES, m.id);
        if (blob) {
          const url = URL.createObjectURL(blob);
          imgHtml = `<div class="img-wrap"><img src="${url}" alt=""></div>`;
        }
      }

      const metaTags = (m.peopleTags || []).concat(m.generalTags || []).slice(0, 4)
        .map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('');

      card.innerHTML = `
        ${imgHtml}
        <div class="card-body">
          <span class="date-tag">${formatDate(m.date) || 'undated'}</span>
          <h3 class="title">${escapeHtml(m.title || 'Untitled')}</h3>
          <p class="preview">${escapeHtml(m.preview || '')}</p>
          ${metaTags ? `<div class="meta">${metaTags}</div>` : ''}
        </div>`;
      card.addEventListener('click', () => openDetail(m.id));
      el.appendChild(card);
    }
  }

  // ============= ADD/EDIT MEMORY MODAL =============
  function openModal(editingId = null) {
    state.editing = editingId;
    state.draft = { image: null, audio: null, audioMime: null };
    document.getElementById('modalTitle').textContent = editingId ? 'Edit memory' : 'New memory';

    document.getElementById('titleInput').value = '';
    document.getElementById('dateInput').value = todayISO();
    document.getElementById('storyInput').value = '';
    document.getElementById('peopleTags').innerHTML = '';
    document.getElementById('generalTags').innerHTML = '';
    resetPhoto();
    resetAudio();

    if (editingId) {
      loadMemory(editingId).then(async (m) => {
        if (!m) return;
        document.getElementById('titleInput').value = m.title || '';
        document.getElementById('dateInput').value = m.date || todayISO();
        document.getElementById('storyInput').value = m.story || '';
        (m.peopleTags || []).forEach(addPersonChip);
        (m.generalTags || []).forEach(addGeneralTagChip);
        if (m.hasImage) {
          const blob = await idbGet(STORE_IMAGES, editingId);
          if (blob) {
            state.draft.image = blob;
            showPhoto(URL.createObjectURL(blob));
          }
        }
        if (m.hasAudio) {
          const blob = await idbGet(STORE_AUDIO, editingId);
          if (blob) {
            state.draft.audio = blob;
            state.draft.audioMime = m.audioMime;
            showAudio(URL.createObjectURL(blob));
          }
        }
      });
    }

    document.getElementById('modalBackdrop').classList.add('open');
    document.getElementById('addModal').classList.add('open');
  }

  function closeModal() {
    document.getElementById('modalBackdrop').classList.remove('open');
    document.getElementById('addModal').classList.remove('open');
    state.editing = null;
    state.draft = { image: null, audio: null, audioMime: null };
  }

  // ============= ABOUT MODAL =============
  function openAbout() {
    document.getElementById('modalBackdrop').classList.add('open');
    document.getElementById('aboutModal').classList.add('open');
  }
  function closeAbout() {
    document.getElementById('modalBackdrop').classList.remove('open');
    document.getElementById('aboutModal').classList.remove('open');
  }

  // ============= PHOTO =============
  function resetPhoto() {
    const drop = document.getElementById('photoDrop');
    drop.classList.remove('has-image');
    drop.querySelectorAll('img, .photo-replace-hint').forEach(n => n.remove());
  }
  function showPhoto(url) {
    const drop = document.getElementById('photoDrop');
    drop.classList.add('has-image');
    drop.querySelectorAll('img, .photo-replace-hint').forEach(n => n.remove());
    const img = document.createElement('img');
    img.src = url;
    drop.appendChild(img);
    const hint = document.createElement('div');
    hint.className = 'photo-replace-hint';
    hint.textContent = 'Tap to replace';
    drop.appendChild(hint);
  }
  document.getElementById('photoInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    state.draft.image = file;
    showPhoto(URL.createObjectURL(file));
  });

  // ============= AUDIO =============
  let mediaRecorder = null;
  let audioChunks = [];

  function resetAudio() {
    document.getElementById('audioPreview').classList.remove('show');
    document.getElementById('audioPlayback').src = '';
    document.getElementById('recordLabel').textContent = 'Tap to record';
    document.getElementById('recordBtn').classList.remove('recording');
  }
  function showAudio(url) {
    document.getElementById('audioPreview').classList.add('show');
    document.getElementById('audioPlayback').src = url;
  }

  async function toggleRecord() {
    const btn = document.getElementById('recordBtn');
    const label = document.getElementById('recordLabel');

    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunks = [];
      let mime = '';
      const tryMimes = ['audio/mp4', 'audio/webm', 'audio/ogg'];
      for (const m of tryMimes) {
        if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) { mime = m; break; }
      }
      mediaRecorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      const chosenMime = mediaRecorder.mimeType || mime || 'audio/webm';

      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); };
      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunks, { type: chosenMime });
        state.draft.audio = blob;
        state.draft.audioMime = chosenMime;
        showAudio(URL.createObjectURL(blob));
        stream.getTracks().forEach(t => t.stop());
        btn.classList.remove('recording');
        label.textContent = 'Re-record';
      };

      mediaRecorder.start();
      btn.classList.add('recording');
      label.textContent = 'Stop recording';
    } catch (err) {
      toast('Microphone access denied');
      console.error(err);
    }
  }
  document.getElementById('recordBtn').addEventListener('click', toggleRecord);

  // ============= TAGS =============
  function addPersonChip(name) {
    if (!name || !name.trim()) return;
    const container = document.getElementById('peopleTags');
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.dataset.value = name.trim();
    chip.innerHTML = `${escapeHtml(name.trim())} <span class="remove">×</span>`;
    chip.addEventListener('click', () => chip.remove());
    container.appendChild(chip);
  }
  function addGeneralTagChip(tag) {
    if (!tag || !tag.trim()) return;
    const container = document.getElementById('generalTags');
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.dataset.value = tag.trim().toLowerCase();
    chip.innerHTML = `${escapeHtml(tag.trim().toLowerCase())} <span class="remove">×</span>`;
    chip.addEventListener('click', () => chip.remove());
    container.appendChild(chip);
  }
  function getChipValues(containerId) {
    return [...document.getElementById(containerId).querySelectorAll('.tag-chip')]
      .map(c => c.dataset.value);
  }

  document.getElementById('addPersonBtn').addEventListener('click', () => {
    const input = document.getElementById('peopleInput');
    input.value.split(',').forEach(v => addPersonChip(v));
    input.value = '';
    input.focus();
  });
  document.getElementById('peopleInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('addPersonBtn').click(); }
  });
  document.getElementById('addTagBtn').addEventListener('click', () => {
    const input = document.getElementById('tagInput');
    input.value.split(',').forEach(v => addGeneralTagChip(v));
    input.value = '';
    input.focus();
  });
  document.getElementById('tagInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('addTagBtn').click(); }
  });

  // ============= SAVE MEMORY =============
  async function saveMemoryFromForm() {
    const title = document.getElementById('titleInput').value.trim();
    const date = document.getElementById('dateInput').value;
    const story = document.getElementById('storyInput').value.trim();
    const peopleTags = getChipValues('peopleTags');
    const generalTags = getChipValues('generalTags');

    if (!title && !story && !state.draft.image) {
      toast('Add a title, story, or photo');
      return;
    }

    const id = state.editing || uuid();
    const existing = state.editing ? await loadMemory(id) : null;

    const hasImage = !!state.draft.image || (existing && existing.hasImage);
    const hasAudio = !!state.draft.audio || (existing && existing.hasAudio);

    const memory = {
      id,
      schema_version: '1.1',
      userId: 'local_user',
      title: title || 'Untitled',
      date: date || null,
      dateApproximate: false,
      story,
      peopleTags,
      generalTags,
      hasImage,
      hasAudio,
      audioMime: state.draft.audioMime || (existing && existing.audioMime) || null,
      preview: story ? story.slice(0, 160) : '',
      created: existing ? existing.created : Date.now(),
      updated: Date.now(),
      synced: false,
    };

    try {
      if (state.draft.image) await idbPut(STORE_IMAGES, id, state.draft.image);
      if (state.draft.audio) await idbPut(STORE_AUDIO, id, state.draft.audio);
      await saveMemory(memory);

      state.memories = await loadAllMemories();
      await renderList();
      closeModal();
      toast(state.editing ? 'Memory updated' : 'Memory saved');
    } catch (err) {
      console.error(err);
      toast('Save failed');
    }
  }

  // ============= DETAIL =============
  async function openDetail(id) {
    const m = await loadMemory(id);
    if (!m) return;
    state.detailId = id;

    let html = '';
    html += `<span class="detail-date">${formatDate(m.date) || 'undated'}</span>`;
    html += `<h1 class="detail-title">${escapeHtml(m.title)}</h1>`;

    if (m.hasImage) {
      const blob = await idbGet(STORE_IMAGES, id);
      if (blob) {
        const url = URL.createObjectURL(blob);
        html += `<img class="detail-img" src="${url}" alt="">`;
      }
    }

    if (m.hasAudio) {
      const blob = await idbGet(STORE_AUDIO, id);
      if (blob) {
        const url = URL.createObjectURL(blob);
        html += `<audio controls src="${url}"></audio>`;
      }
    }

    if (m.story) {
      html += `<div class="detail-story">${escapeHtml(m.story)}</div>`;
    }

    const allTags = [...(m.peopleTags || []), ...(m.generalTags || [])];
    if (allTags.length) {
      html += `<div class="detail-meta">${allTags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>`;
    }

    document.getElementById('detailContent').innerHTML = html;
    document.getElementById('modalBackdrop').classList.add('open');
    document.getElementById('detailModal').classList.add('open');
  }

  function closeDetail() {
    document.getElementById('modalBackdrop').classList.remove('open');
    document.getElementById('detailModal').classList.remove('open');
    state.detailId = null;
  }

  async function deleteCurrent() {
    if (!state.detailId) return;
    if (!confirm('Delete this memory? This cannot be undone.')) return;
    const id = state.detailId;
    await deleteMemoryData(id);
    state.memories = await loadAllMemories();
    closeDetail();
    await renderList();
    toast('Memory deleted');
  }

  async function editCurrent() {
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
    const payload = {
      schema_version: '1.1',
      exported_at: new Date().toISOString(),
      user: { name: state.settings.name || null },
      description: 'Legacy memory export. Images and audio are base64-encoded inline for portability.',
      memories: []
    };
    for (const entry of state.memories) {
      const m = await loadMemory(entry.id);
      if (!m) continue;
      const out = { ...m };
      if (m.hasImage) {
        const blob = await idbGet(STORE_IMAGES, m.id);
        if (blob) out.imageData = await blobToBase64(blob);
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
    a.download = `legacy-memories-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast(`Exported ${payload.memories.length} memories`);
  }

  // ============= WIRING =============
  document.getElementById('fab').addEventListener('click', () => openModal());
  document.getElementById('closeModal').addEventListener('click', closeModal);
  document.getElementById('cancelBtn').addEventListener('click', closeModal);
  document.getElementById('saveBtn').addEventListener('click', saveMemoryFromForm);
  document.getElementById('closeDetail').addEventListener('click', closeDetail);
  document.getElementById('deleteBtn').addEventListener('click', deleteCurrent);
  document.getElementById('editBtn').addEventListener('click', editCurrent);
  document.getElementById('exportBtn').addEventListener('click', exportAll);

  document.getElementById('aboutBtn').addEventListener('click', openAbout);
  document.getElementById('closeAbout').addEventListener('click', closeAbout);

  document.getElementById('settingsBtn').addEventListener('click', openSettings);
  document.getElementById('closeSettings').addEventListener('click', closeSettings);
  document.getElementById('cancelSettings').addEventListener('click', closeSettings);
  document.getElementById('saveSettings').addEventListener('click', applySettings);

  document.getElementById('welcomeCta').addEventListener('click', dismissWelcome);
  document.getElementById('addFromChatBtn').addEventListener('click', () => {
    switchTab('memories');
    setTimeout(() => openModal(), 200);
  });

  document.getElementById('modalBackdrop').addEventListener('click', () => {
    closeModal();
    closeDetail();
    closeAbout();
    closeSettings();
  });

  // ============= INIT =============
  (async () => {
    try {
      await openDB();
      state.settings = await loadSettings();
      state.memories = await loadAllMemories();
      applyPersonalization();
      await renderList();
      showWelcomeIfFirstTime();
    } catch (err) {
      console.error('Init failed', err);
      toast('Storage init failed');
    }
  })();

})();
