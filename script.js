/**
 * DUMPZONE — script.js
 * Temporary file dump & cross-device transfer
 * All data stored in localStorage (simulated backend).
 * In production, replace storage calls with real API calls.
 */

// ──────────────────────────────────────────
//  Constants & State
// ──────────────────────────────────────────
const STORAGE_KEY   = 'dumpzone_drops';
const EXPIRY_MS     = 24 * 60 * 60 * 1000; // 24 hours
const CODE_CHARS    = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars

let queuedFiles = []; // Files waiting to be uploaded

// ──────────────────────────────────────────
//  DOM Refs
// ──────────────────────────────────────────
const dropZone        = document.getElementById('dropZone');
const fileInput       = document.getElementById('fileInput');
const browseBtn       = document.getElementById('browseBtn');
const fileList        = document.getElementById('fileList');
const fileQueue       = document.getElementById('fileQueue');
const clearAllBtn     = document.getElementById('clearAllBtn');
const uploadBtn       = document.getElementById('uploadBtn');
const activeDrops     = document.getElementById('activeDrops');
const emptyState      = document.getElementById('emptyState');
const codeInput       = document.getElementById('codeInput');
const fetchBtn        = document.getElementById('fetchBtn');
const fetchedResult   = document.getElementById('fetchedResult');
const toast           = document.getElementById('toast');
const progressOverlay = document.getElementById('progressOverlay');
const progressBar     = document.getElementById('progressBar');
const progressLabel   = document.getElementById('progressLabel');
const progressPct     = document.getElementById('progressPct');
const statusText      = document.getElementById('statusText');

// ──────────────────────────────────────────
//  Utilities
// ──────────────────────────────────────────

/** Generate a random N-character drop code */
function generateCode(len = 6) {
  return Array.from({ length: len }, () =>
    CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  ).join('');
}

/** Format bytes to human-readable */
function formatSize(bytes) {
  if (bytes < 1024)       return bytes + ' B';
  if (bytes < 1048576)    return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1073741824).toFixed(2) + ' GB';
}

/** Get file extension */
function getExt(name) {
  const parts = name.split('.');
  return parts.length > 1 ? parts.pop().toUpperCase().slice(0, 6) : 'FILE';
}

/** Get file type icon */
function getFileIcon(name) {
  const ext = name.split('.').pop().toLowerCase();
  const icons = {
    pdf: '📄', jpg: '🖼', jpeg: '🖼', png: '🖼', gif: '🖼', webp: '🖼', svg: '🖼',
    mp4: '🎬', mov: '🎬', avi: '🎬', webm: '🎬',
    mp3: '🎵', wav: '🎵', flac: '🎵', ogg: '🎵',
    zip: '🗜', rar: '🗜', tar: '🗜', gz: '🗜',
    doc: '📝', docx: '📝', txt: '📝', md: '📝',
    xls: '📊', xlsx: '📊', csv: '📊',
    ppt: '📑', pptx: '📑',
    html: '🌐', css: '🎨', js: '⚡', json: '⚙',
    py: '🐍', ts: '⚡', jsx: '⚡', tsx: '⚡',
  };
  return icons[ext] || '📦';
}

/** Show a toast notification */
let toastTimer;
function showToast(msg, type = 'default') {
  toast.textContent = msg;
  toast.className = `toast visible ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.className = 'toast'; }, 3000);
}

/** Read all drops from localStorage, clean expired ones */
function getDrops() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const drops = raw ? JSON.parse(raw) : {};
    const now = Date.now();
    let changed = false;
    for (const code in drops) {
      if (drops[code].expiresAt < now) {
        delete drops[code];
        changed = true;
      }
    }
    if (changed) saveDrops(drops);
    return drops;
  } catch { return {}; }
}

/** Save drops to localStorage */
function saveDrops(drops) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(drops));
}

/** Format countdown */
function formatExpiry(expiresAt) {
  const ms = expiresAt - Date.now();
  if (ms <= 0) return 'EXPIRED';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m left`;
}

/** Update status text */
function setStatus(text) {
  statusText.textContent = text;
}

// ──────────────────────────────────────────
//  File Queue Management
// ──────────────────────────────────────────

function addFilesToQueue(files) {
  Array.from(files).forEach(file => {
    // Avoid duplicates
    if (!queuedFiles.some(f => f.name === file.name && f.size === file.size)) {
      queuedFiles.push(file);
    }
  });
  renderQueue();
}

function removeFromQueue(index) {
  queuedFiles.splice(index, 1);
  renderQueue();
}

function clearQueue() {
  queuedFiles = [];
  renderQueue();
}

function renderQueue() {
  fileList.innerHTML = '';
  if (queuedFiles.length === 0) {
    fileQueue.classList.remove('visible');
    uploadBtn.disabled = true;
    return;
  }
  fileQueue.classList.add('visible');
  uploadBtn.disabled = false;

  queuedFiles.forEach((file, i) => {
    const li = document.createElement('li');
    li.className = 'file-item';
    li.innerHTML = `
      <span class="file-type-badge">${getExt(file.name)}</span>
      <div class="file-info">
        <div class="file-name" title="${file.name}">${file.name}</div>
        <div class="file-size">${formatSize(file.size)}</div>
      </div>
      <button class="file-remove" data-index="${i}" title="Remove">×</button>
    `;
    fileList.appendChild(li);
  });

  // Remove buttons
  fileList.querySelectorAll('.file-remove').forEach(btn => {
    btn.addEventListener('click', () => removeFromQueue(Number(btn.dataset.index)));
  });
}

// ──────────────────────────────────────────
//  Upload (Simulated — reads as base64)
// ──────────────────────────────────────────

async function uploadFiles() {
  if (queuedFiles.length === 0) return;

  progressOverlay.classList.add('visible');
  progressBar.style.width = '0%';
  progressPct.textContent = '0%';
  progressLabel.textContent = 'Reading files...';

  const total = queuedFiles.length;
  const fileDataList = [];

  for (let i = 0; i < total; i++) {
    const file = queuedFiles[i];
    progressLabel.textContent = `Reading: ${file.name}`;
    const pct = Math.round((i / total) * 80);
    progressBar.style.width = pct + '%';
    progressPct.textContent = pct + '%';

    // Read as base64 (for localStorage demo; in production use FormData + API)
    const base64 = await readFileAsBase64(file);
    fileDataList.push({
      name: file.name,
      size: file.size,
      type: file.type,
      data: base64,
    });

    await sleep(120); // simulate transfer delay
  }

  // Simulate "upload" progress 80→100
  for (let p = 80; p <= 100; p += 4) {
    progressBar.style.width = p + '%';
    progressPct.textContent = p + '%';
    progressLabel.textContent = 'Generating drop link...';
    await sleep(40);
  }

  // Create the drop
  const code     = generateCode(6);
  const expiresAt = Date.now() + EXPIRY_MS;
  const drops    = getDrops();
  drops[code] = { code, files: fileDataList, createdAt: Date.now(), expiresAt };
  saveDrops(drops);

  progressOverlay.classList.remove('visible');
  clearQueue();
  renderActiveDrops();
  setStatus(`Drop created! Code: ${code}`);
  showToast(`✓ Drop created — Code: ${code}`, 'success');
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result); // includes data URI prefix
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ──────────────────────────────────────────
//  Render Active Drops
// ──────────────────────────────────────────

function renderActiveDrops() {
  const drops = getDrops();
  const codes = Object.keys(drops);

  // Clear all except empty state
  activeDrops.innerHTML = '';

  if (codes.length === 0) {
    activeDrops.appendChild(emptyState);
    return;
  }

  codes.sort((a, b) => drops[b].createdAt - drops[a].createdAt).forEach(code => {
    const drop = drops[code];
    const card = buildDropCard(drop);
    activeDrops.appendChild(card);
  });
}

function buildDropCard(drop) {
  const card = document.createElement('div');
  card.className = 'drop-card';
  card.id = `card-${drop.code}`;

  const totalSize = drop.files.reduce((s, f) => s + f.size, 0);

  card.innerHTML = `
    <div class="drop-card-header">
      <div>
        <div class="drop-card-title">DROP #${drop.code}</div>
        <div class="drop-card-meta">
          <span>📁 ${drop.files.length} file${drop.files.length !== 1 ? 's' : ''}</span>
          <span>💾 ${formatSize(totalSize)}</span>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;">
        <span class="expires-badge" id="expiry-${drop.code}">${formatExpiry(drop.expiresAt)}</span>
        <button class="btn-delete-drop" data-code="${drop.code}" title="Delete drop">✕</button>
      </div>
    </div>

    <ul class="drop-files-list">
      ${drop.files.map(f => `
        <li class="drop-file-entry">
          <span class="drop-file-icon">${getFileIcon(f.name)}</span>
          <span class="drop-file-name" title="${f.name}">${f.name}</span>
          <span class="drop-file-size">${formatSize(f.size)}</span>
        </li>
      `).join('')}
    </ul>

    <div class="share-row">
      <div class="drop-code-box">
        <span class="drop-code-label">Code</span>
        <span class="drop-code-value">${drop.code}</span>
      </div>
      <button class="btn-copy" data-code="${drop.code}">COPY CODE</button>
    </div>

    <div class="download-row" id="dl-row-${drop.code}">
      ${drop.files.map((f, i) => `
        <button class="btn-download" data-code="${drop.code}" data-index="${i}">
          ↓ ${f.name.length > 18 ? f.name.slice(0,15)+'…' : f.name}
        </button>
      `).join('')}
    </div>
  `;

  // Delete drop
  card.querySelector('.btn-delete-drop').addEventListener('click', () => {
    deleteDrop(drop.code);
  });

  // Copy code
  card.querySelector('.btn-copy').addEventListener('click', function() {
    copyToClipboard(drop.code);
    this.textContent = '✓ COPIED';
    this.classList.add('copied');
    setTimeout(() => {
      this.textContent = 'COPY CODE';
      this.classList.remove('copied');
    }, 2000);
  });

  // Download buttons
  card.querySelectorAll('.btn-download').forEach(btn => {
    btn.addEventListener('click', () => {
      downloadFile(drop.code, Number(btn.dataset.index));
    });
  });

  return card;
}

function deleteDrop(code) {
  const drops = getDrops();
  delete drops[code];
  saveDrops(drops);
  renderActiveDrops();
  showToast('Drop deleted.', 'error');
  setStatus('Ready to receive files');
}

// ──────────────────────────────────────────
//  Fetch Drop by Code
// ──────────────────────────────────────────

function fetchDrop() {
  const code = codeInput.value.trim().toUpperCase();
  if (!code) { showToast('Enter a drop code first.', 'error'); return; }

  const drops = getDrops();
  const drop  = drops[code];

  fetchedResult.innerHTML = '';

  if (!drop) {
    fetchedResult.innerHTML = `
      <div style="font-family:var(--font-mono);font-size:11px;color:var(--accent2);padding:14px;border:1px solid rgba(255,77,0,0.3);border-radius:2px;letter-spacing:0.08em;">
        ✗ NO DROP FOUND FOR CODE: ${code}
      </div>
    `;
    showToast(`No drop found for: ${code}`, 'error');
    return;
  }

  const totalSize = drop.files.reduce((s, f) => s + f.size, 0);

  const resultCard = document.createElement('div');
  resultCard.className = 'drop-card';
  resultCard.innerHTML = `
    <div class="drop-card-header">
      <div>
        <div class="drop-card-title">DROP #${drop.code} FOUND</div>
        <div class="drop-card-meta">
          <span>📁 ${drop.files.length} file${drop.files.length !== 1 ? 's' : ''}</span>
          <span>💾 ${formatSize(totalSize)}</span>
        </div>
      </div>
      <span class="expires-badge">${formatExpiry(drop.expiresAt)}</span>
    </div>

    <ul class="drop-files-list">
      ${drop.files.map(f => `
        <li class="drop-file-entry">
          <span class="drop-file-icon">${getFileIcon(f.name)}</span>
          <span class="drop-file-name" title="${f.name}">${f.name}</span>
          <span class="drop-file-size">${formatSize(f.size)}</span>
        </li>
      `).join('')}
    </ul>

    <div class="download-row">
      ${drop.files.map((f, i) => `
        <button class="btn-download" data-code="${drop.code}" data-index="${i}">
          ↓ ${f.name.length > 18 ? f.name.slice(0,15)+'…' : f.name}
        </button>
      `).join('')}
      ${drop.files.length > 1 ? `<button class="btn-download" id="dlAll-${drop.code}">↓ ALL FILES</button>` : ''}
    </div>
  `;

  // Download individual
  resultCard.querySelectorAll('.btn-download').forEach(btn => {
    if (!btn.id.startsWith('dlAll')) {
      btn.addEventListener('click', () => downloadFile(drop.code, Number(btn.dataset.index)));
    }
  });

  // Download all
  const dlAll = resultCard.querySelector(`#dlAll-${drop.code}`);
  if (dlAll) {
    dlAll.addEventListener('click', () => {
      drop.files.forEach((_, i) => setTimeout(() => downloadFile(drop.code, i), i * 300));
    });
  }

  fetchedResult.appendChild(resultCard);
  showToast(`✓ Drop ${code} found — ${drop.files.length} file(s)`, 'success');
  codeInput.value = '';
}

// ──────────────────────────────────────────
//  Download File
// ──────────────────────────────────────────

function downloadFile(code, index) {
  const drops = getDrops();
  const drop  = drops[code];
  if (!drop) { showToast('Drop not found or expired.', 'error'); return; }

  const file = drop.files[index];
  if (!file) return;

  // Create a link and trigger download
  const a = document.createElement('a');
  a.href     = file.data; // base64 data URI
  a.download = file.name;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  showToast(`↓ Downloading ${file.name}`, 'success');
}

// ──────────────────────────────────────────
//  Copy to Clipboard
// ──────────────────────────────────────────

function copyToClipboard(text) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
  showToast(`Copied: ${text}`, 'success');
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;opacity:0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
}

// ──────────────────────────────────────────
//  Expiry Countdown Timer
// ──────────────────────────────────────────

function startExpiryTimer() {
  setInterval(() => {
    const drops = getDrops(); // also cleans expired
    Object.values(drops).forEach(drop => {
      const el = document.getElementById(`expiry-${drop.code}`);
      if (el) el.textContent = formatExpiry(drop.expiresAt);
    });
  }, 60000); // every minute
}

// ──────────────────────────────────────────
//  Drag & Drop Events
// ──────────────────────────────────────────

dropZone.addEventListener('dragenter', e => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', e => {
  if (!dropZone.contains(e.relatedTarget)) {
    dropZone.classList.remove('drag-over');
  }
});

dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const files = e.dataTransfer.files;
  if (files.length) {
    addFilesToQueue(files);
    showToast(`${files.length} file(s) added to queue`, 'success');
  }
});

// Click on drop zone (not the button)
dropZone.addEventListener('click', e => {
  if (e.target !== browseBtn) fileInput.click();
});

// ──────────────────────────────────────────
//  Event Listeners
// ──────────────────────────────────────────

browseBtn.addEventListener('click', e => {
  e.stopPropagation();
  fileInput.click();
});

fileInput.addEventListener('change', () => {
  if (fileInput.files.length) {
    addFilesToQueue(fileInput.files);
    showToast(`${fileInput.files.length} file(s) added to queue`, 'success');
    fileInput.value = ''; // allow re-adding same file
  }
});

clearAllBtn.addEventListener('click', () => {
  clearQueue();
  showToast('Queue cleared.');
});

uploadBtn.addEventListener('click', uploadFiles);

fetchBtn.addEventListener('click', fetchDrop);

codeInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') fetchDrop();
});

codeInput.addEventListener('input', () => {
  codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
});

// ──────────────────────────────────────────
//  Paste anywhere for code
// ──────────────────────────────────────────
document.addEventListener('paste', e => {
  const active = document.activeElement;
  // Only intercept if not in an input
  if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
  const text = e.clipboardData.getData('text').trim().toUpperCase();
  if (/^[A-Z0-9]{4,8}$/.test(text)) {
    codeInput.value = text;
    codeInput.focus();
    showToast(`Code pasted: ${text}. Press Enter to fetch.`, 'success');
  }
});

// ──────────────────────────────────────────
//  Global drag prevention (prevent browser nav on missed drops)
// ──────────────────────────────────────────
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => e.preventDefault());

// ──────────────────────────────────────────
//  Init
// ──────────────────────────────────────────
function init() {
  renderActiveDrops();
  startExpiryTimer();
  setStatus('Ready to receive files');
  console.log('%cDUMPZONE ready.', 'font-family:monospace;color:#e8ff00;font-size:16px;font-weight:bold;');
}

init();