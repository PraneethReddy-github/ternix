// ── GitHub API ──
const OWNER = 'PraneethReddy-github';
const REPO  = 'ternix';
const API   = `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`;

// ── Navbar scroll effect ──
window.addEventListener('scroll', () => {
  document.getElementById('navbar')?.classList.toggle('scrolled', window.scrollY > 20);
});

// ── Scroll to download ──
function scrollToDownload() {
  document.getElementById('download')?.scrollIntoView({ behavior: 'smooth' });
}

// ── Install tabs ──
function showInstallTab(id) {
  document.querySelectorAll('.install-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.install-panel').forEach(p => p.classList.remove('active'));
  document.getElementById(`tab-${id}`)?.classList.add('active');
  document.getElementById(`panel-${id}`)?.classList.add('active');
}

// ── Copy code ──
function copyCode(id) {
  const pre = document.getElementById(id);
  if (!pre) return;
  const text = pre.innerText;
  navigator.clipboard.writeText(text).then(() => {
    const btns = document.querySelectorAll('.copy-btn');
    btns.forEach(btn => {
      if (btn.getAttribute('onclick')?.includes(id)) {
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = 'Copy', 2000);
      }
    });
  });
}

// ── Format file size ──
function formatSize(bytes) {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
}

// ── Format date ──
function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

// ── Build download button HTML ──
function makeDownloadBtn(label, meta, url) {
  return `
    <a class="download-btn" href="${url}" id="btn-${label.replace(/\s+/g,'-').toLowerCase()}">
      <div class="download-btn-info">
        <span class="download-btn-label">${label}</span>
        <span class="download-btn-meta">${meta}</span>
      </div>
      <div class="download-btn-arrow">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
      </div>
    </a>`;
}

// ── Fetch and render release info ──
async function loadRelease() {
  try {
    const res = await fetch(API);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const version = data.tag_name?.replace(/^v/, '') || '?';
    const tag     = data.tag_name || '';
    const date    = data.published_at ? formatDate(data.published_at) : '';
    const assets  = data.assets || [];

    // ── Update version labels ──
    const els = ['hero-version-badge','stat-version','download-version-title'];
    els.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = id === 'hero-version-badge' ? `${tag} — Now Available` : version;
    });
    const dateEl = document.getElementById('download-date');
    if (dateEl) dateEl.textContent = `Released ${date} · Free & Open Source`;

    // ── Categorise assets ──
    const find = (patterns) => assets.find(a => patterns.some(p => a.name.match(p)));

    const setup    = find([/Setup.*\.exe$/i, /Ternix\.Setup.*exe$/i]);
    const portable = find([/^Ternix-[\d.]+\.exe$/i, /^Ternix\.[\d.]+\.exe$/i]);
    const appimage = find([/\.AppImage$/i]);
    const deb      = find([/\.deb$/i]);

    // ── Windows card ──
    const winEl = document.getElementById('windows-options');
    if (winEl) {
      let html = '';
      if (setup)    html += makeDownloadBtn('Installer (.exe)', `NSIS Installer · ${formatSize(setup.size)}`, setup.browser_download_url);
      if (portable) html += makeDownloadBtn('Portable (.exe)', `No install needed · ${formatSize(portable.size)}`, portable.browser_download_url);
      if (!html)    html = `<p style="color:var(--text-muted);font-size:.9rem">No Windows assets found in this release.</p>`;
      winEl.innerHTML = html;
    }

    // ── Linux card ──
    const linuxEl = document.getElementById('linux-options');
    if (linuxEl) {
      let html = '';
      if (deb)      html += makeDownloadBtn('.deb Package', `Debian/Ubuntu · ${formatSize(deb.size)}`, deb.browser_download_url);
      if (appimage) html += makeDownloadBtn('AppImage', `Universal Linux · ${formatSize(appimage.size)}`, appimage.browser_download_url);
      if (!html)    html = `<p style="color:var(--text-muted);font-size:.9rem">No Linux assets found in this release.</p>`;
      linuxEl.innerHTML = html;
    }

    // ── Update install-section URLs ──
    if (setup) {
      const el = document.getElementById('win-setup-url');
      if (el) el.textContent = `"${setup.browser_download_url}"`;
    }
    if (deb) {
      const el = document.getElementById('deb-url');
      if (el) el.textContent = `"${deb.browser_download_url}"`;
    }
    if (appimage) {
      const el = document.getElementById('appimage-url');
      if (el) el.textContent = `"${appimage.browser_download_url}"`;
    }

    // ── Release notes ──
    if (data.body) {
      const bodyEl = document.getElementById('release-body');
      if (bodyEl) {
        bodyEl.innerHTML = data.body
          .split('\n')
          .filter(l => l.trim())
          .map(l => `<p>${l.replace(/^[*-]\s+/, '• ')}</p>`)
          .join('');
      }
      document.getElementById('release-notes').style.display = 'block';
    }

    // ── Show grid ──
    document.getElementById('loading-state').style.display = 'none';
    document.getElementById('download-grid').style.display = 'grid';

  } catch (err) {
    console.error('Release fetch failed:', err);
    document.getElementById('loading-state').style.display = 'none';
    document.getElementById('error-state').style.display = 'block';
  }
}

// ── Terminal typewriter ──
const SEQUENCES = [
  {
    cmd: 'ssh admin@prod-server-01',
    out: [
      '<span class="t-success">✓ Connected to prod-server-01</span>',
      '<span class="t-info">Welcome to Ubuntu 24.04 LTS</span>',
      'Last login: Thu Jun 19 08:00:01 2026',
    ]
  },
  {
    cmd: 'ternix session list',
    out: [
      '<span class="t-info">ID  HOST               STATUS</span>',
      '<span class="t-success">01  prod-server-01     Connected</span>',
      '02  staging-api        Connected',
      '<span class="t-warn">03  dev-01             Idle</span>',
    ]
  },
  {
    cmd: 'top -bn1 | head -5',
    out: [
      'top - 08:31:17 up 42 days,  3:12,  2 users',
      '<span class="t-info">Tasks: 234 total,   1 running, 233 sleeping</span>',
      '<span class="t-success">%Cpu(s):  2.4 us,  0.8 sy,  0.0 ni, 96.5 id</span>',
    ]
  },
];

let seqIdx = 0;
let charIdx = 0;
let phase = 'typing'; // typing | waiting | clearing | outputting
let outIdx = 0;
let outLineIdx = 0;

function runTerminal() {
  const typedEl = document.getElementById('typed-text');
  const outputEl = document.getElementById('terminal-output');
  if (!typedEl || !outputEl) return;

  const seq = SEQUENCES[seqIdx % SEQUENCES.length];

  if (phase === 'typing') {
    if (charIdx <= seq.cmd.length) {
      typedEl.textContent = seq.cmd.slice(0, charIdx++);
      setTimeout(runTerminal, 55);
    } else {
      phase = 'waiting';
      setTimeout(runTerminal, 600);
    }
  } else if (phase === 'waiting') {
    phase = 'outputting';
    outIdx = 0;
    setTimeout(runTerminal, 100);
  } else if (phase === 'outputting') {
    if (outIdx < seq.out.length) {
      const line = document.createElement('div');
      line.innerHTML = seq.out[outIdx++];
      outputEl.appendChild(line);
      setTimeout(runTerminal, 280);
    } else {
      phase = 'clearing';
      setTimeout(runTerminal, 2800);
    }
  } else if (phase === 'clearing') {
    typedEl.textContent = '';
    outputEl.innerHTML = '';
    charIdx = 0;
    outIdx = 0;
    phase = 'typing';
    seqIdx++;
    setTimeout(runTerminal, 400);
  }
}

// ── Init ──
window.addEventListener('DOMContentLoaded', () => {
  loadRelease();
  setTimeout(runTerminal, 800);
});
