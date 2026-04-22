<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Legacy">
<meta name="theme-color" content="#0a1628">
<meta name="description" content="A private memory vault. Quiet stories, saved in your voice.">
<link rel="manifest" href="./manifest.webmanifest">
<link rel="apple-touch-icon" href="./icons/icon-192.png">
<link rel="icon" type="image/png" sizes="32x32" href="./icons/icon-32.png">
<title>Legacy — A memory for later</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="./styles.css">
</head>
<body>

<div id="app">
  <header class="masthead">
    <div class="eyebrow">Legacy · MVP</div>
    <h1>A memory for later</h1>
    <div class="subtitle">Quiet stories, saved in your voice.</div>
  </header>

  <div class="toolbar">
    <div class="count"><strong id="memoryCount">0</strong> memories</div>
    <div class="toolbar-actions">
      <button class="icon-btn" id="exportBtn" title="Export all memories" aria-label="Export">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
      </button>
    </div>
  </div>

  <div class="memories" id="memoryList"></div>

  <button class="fab" id="fab" aria-label="Add memory">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"></line>
      <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>
  </button>
</div>

<div class="modal-backdrop" id="modalBackdrop"></div>

<div class="modal" id="addModal">
  <div class="modal-inner">
    <header class="modal-header">
      <h2 id="modalTitle">New memory</h2>
      <button class="icon-btn" id="closeModal" aria-label="Close">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </header>

    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">Photo</label>
        <div class="photo-drop" id="photoDrop">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"></rect>
            <circle cx="8.5" cy="8.5" r="1.5"></circle>
            <polyline points="21 15 16 10 5 21"></polyline>
          </svg>
          <div class="drop-text">Tap to add a photo</div>
          <input type="file" id="photoInput" accept="image/*">
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Title</label>
        <input type="text" id="titleInput" class="title-input" placeholder="The day we went to the beach">
      </div>

      <div class="form-group">
        <label class="form-label">When</label>
        <input type="date" id="dateInput">
      </div>

      <div class="form-group">
        <label class="form-label">Tell the story</label>
        <div class="audio-section">
          <button class="record-btn" id="recordBtn">
            <span class="dot"></span>
            <span id="recordLabel">Tap to record</span>
          </button>
          <div class="audio-preview" id="audioPreview">
            <audio controls id="audioPlayback"></audio>
            <div class="audio-hint">You can keep this audio, or re-record.</div>
          </div>
        </div>
        <textarea id="storyInput" placeholder="Or write it here. Tell it the way you'd tell it out loud."></textarea>
        <div class="transcribe-note">
          <strong>On transcription</strong>
          In the final app, recorded audio will auto-transcribe in your voice. For now, record audio <em>and</em> type the story yourself — both will save.
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Who was there</label>
        <div class="tag-row" id="peopleTags"></div>
        <div class="tag-input-wrap" style="margin-top: 10px;">
          <input type="text" id="peopleInput" placeholder="Add a name">
          <button type="button" id="addPersonBtn">Add</button>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Tags</label>
        <div class="tag-row" id="generalTags"></div>
        <div class="tag-input-wrap" style="margin-top: 10px;">
          <input type="text" id="tagInput" placeholder="beach, summer, first time">
          <button type="button" id="addTagBtn">Add</button>
        </div>
      </div>
    </div>

    <footer class="modal-footer">
      <button class="btn-secondary" id="cancelBtn">Cancel</button>
      <button class="btn-primary" id="saveBtn">Save memory</button>
    </footer>
  </div>
</div>

<div class="modal" id="detailModal">
  <div class="modal-inner">
    <header class="modal-header">
      <h2>Memory</h2>
      <button class="icon-btn" id="closeDetail" aria-label="Close">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </header>
    <div class="detail-view" id="detailContent"></div>
    <footer class="modal-footer">
      <button class="btn-secondary" id="editBtn">Edit</button>
      <button class="btn-danger" id="deleteBtn">Delete</button>
    </footer>
  </div>
</div>

<div class="toast" id="toast"></div>

<script src="./app.js"></script>
<script>
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js').catch(err => console.warn('SW failed:', err));
    });
  }
</script>
</body>
</html>
