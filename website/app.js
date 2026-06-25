/* ==========================================================
   THEME TOGGLE
   ========================================================== */
const themeToggle = document.getElementById('theme-toggle');
const htmlEl = document.documentElement;

// Load saved theme or default to light
const savedTheme = localStorage.getItem('ternix_theme') || 'light';
htmlEl.setAttribute('data-theme', savedTheme);

themeToggle.addEventListener('click', () => {
  const currentTheme = htmlEl.getAttribute('data-theme');
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  htmlEl.setAttribute('data-theme', newTheme);
  localStorage.setItem('ternix_theme', newTheme);
});

/* ==========================================================
   GITHUB RELEASES (DOWNLOADS)
   ========================================================== */
const OWNER = 'PraneethReddy-github';
const REPO  = 'ternix';
const API   = `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`;

function formatSize(bytes) {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function makeDownloadItem(name, meta, url, iconHtml) {
  return `
    <a href="${url}" class="dl-item">
      <div class="dl-item-info">
        <span class="dl-item-name">${name}</span>
        <span class="dl-item-meta">${meta}</span>
      </div>
      <div class="dl-item-icon">
        ${iconHtml || `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`}
      </div>
    </a>`;
}

async function loadRelease() {
  try {
    const res = await fetch(API);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const version = data.tag_name?.replace(/^v/, '') || '?';
    const tag     = data.tag_name || '';
    const date    = data.published_at ? formatDate(data.published_at) : '';
    const assets  = data.assets || [];

    // Update version & date
    document.getElementById('download-title').textContent = `Get Ternix ${tag}`;
    document.getElementById('download-date').textContent = `Released ${date} · Free & Open Source`;

    // Categorise assets
    const find = (patterns) => assets.find(a => patterns.some(p => a.name.match(p)));

    const setup    = find([/Setup.*\.exe$/i, /Ternix\.Setup.*exe$/i]);
    const portable = find([/^Ternix-[\d.]+\.exe$/i, /^Ternix\.[\d.]+\.exe$/i]);
    const appimage = find([/\.AppImage$/i]);
    const deb      = find([/\.deb$/i]);

    // Windows
    const winEl = document.getElementById('windows-options');
    if (winEl) {
      let html = '';
      if (setup)    html += makeDownloadItem('Installer (.exe)', `NSIS Installer · ${formatSize(setup.size)}`, setup.browser_download_url);
      if (portable) html += makeDownloadItem('Portable (.exe)', `No install needed · ${formatSize(portable.size)}`, portable.browser_download_url);
      if (!html)    html = `<p style="font-size:13px;color:var(--muted)">No Windows assets found in this release.</p>`;
      winEl.innerHTML = html;
    }

    // Linux
    const linuxEl = document.getElementById('linux-options');
    if (linuxEl) {
      let html = '';
      if (deb)      html += makeDownloadItem('.deb Package', `Debian/Ubuntu · ${formatSize(deb.size)}`, deb.browser_download_url);
      if (appimage) html += makeDownloadItem('AppImage', `Universal Linux · ${formatSize(appimage.size)}`, appimage.browser_download_url);
      if (!html)    html = `<p style="font-size:13px;color:var(--muted)">No Linux assets found in this release.</p>`;
      linuxEl.innerHTML = html;
    }

    // Show grid
    document.getElementById('loading-state').style.display = 'none';
    document.getElementById('download-grid').style.display = 'grid';

  } catch (err) {
    console.error('Release fetch failed:', err);
    document.getElementById('loading-state').style.display = 'none';
    document.getElementById('error-state').style.display = 'block';
  }
}

/* ==========================================================
   TERMINAL TYPING ANIMATION
   ========================================================== */
const terminalBody = document.getElementById('terminal-body');
const terminalWindow = document.getElementById('terminal-window');
const cursorEl = document.getElementById('cursor');

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const script = [
  { type: 'prompt', user: 'praneeth', host: 'devbox' },
  { type: 'type', text: 'ssh admin@prod-server-01' },
  { type: 'pause', ms: 600 },
  { type: 'output', text: '' },
  { type: 'output', html: 'admin@prod-server-01\'s password: <span class="cursor" style="animation: none; opacity: 1"></span>' },
  { type: 'pause', ms: 800 },
  { type: 'output', text: '' },
  { type: 'output', html: '<span class="t-check">Welcome to Ubuntu 24.04.1 LTS (GNU/Linux 6.8.0-35-generic x86_64)</span>' },
  { type: 'output', text: 'Last login: Thu Jun 19 08:00:01 2026 from 10.0.1.42' },
  { type: 'pause', ms: 500 },
  { type: 'prompt', user: 'admin', host: 'prod-server-01' },
  { type: 'type', text: 'htop' },
  { type: 'pause', ms: 500 },
  { type: 'output', text: '' },
  { type: 'output', html: '<span class="t-muted">[████████░░░░░░░░] CPU  34.2%    [██████░░░░░░░░░░] MEM  22.1%</span>' },
  { type: 'output', text: '' },
  { type: 'output', html: '<span class="t-muted">PID   USER   CPU%  MEM%  COMMAND</span>' },
  { type: 'output', text: '1847  root   12.4   2.1  /usr/sbin/nginx' },
  { type: 'output', text: '2341  app    44.2   8.7  node server.js' },
  { type: 'pause', ms: 1200 },
  { type: 'prompt', user: 'admin', host: 'prod-server-01' },
  { type: 'cursor', text: '' },
];

function createPromptHTML(user, host) {
  return '<span class="t-prompt">' + user + '@' + host + ':~$</span> ';
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function typeText(text, container) {
  for (let i = 0; i < text.length; i++) {
    const charNode = document.createTextNode(text[i]);
    container.insertBefore(charNode, cursorEl);
    const delay = 30 + Math.random() * 50;
    await sleep(delay);
  }
}

async function runTerminal() {
  terminalBody.innerHTML = '';
  terminalBody.appendChild(cursorEl);

  let currentLine = null;

  for (const step of script) {
    if (step.type === 'prompt') {
      const line = document.createElement('div');
      line.innerHTML = createPromptHTML(step.user, step.host);
      terminalBody.insertBefore(line, cursorEl);
      line.appendChild(cursorEl);
      currentLine = line;
      await sleep(200);
    } else if (step.type === 'type') {
      if (prefersReducedMotion) {
        const textNode = document.createTextNode(step.text);
        currentLine.insertBefore(textNode, cursorEl);
      } else {
        await typeText(step.text, currentLine);
      }
      await sleep(300);
      terminalBody.appendChild(cursorEl);
    } else if (step.type === 'output') {
      const line = document.createElement('div');
      if (step.html) {
        line.innerHTML = step.html;
      } else {
        line.textContent = step.text;
      }
      terminalBody.insertBefore(line, cursorEl);
      await sleep(40);
    } else if (step.type === 'pause') {
      if (!prefersReducedMotion) {
        await sleep(step.ms);
      }
    } else if (step.type === 'cursor') {
      if (currentLine) {
        currentLine.appendChild(cursorEl);
      }
    }
  }

  await sleep(3000);
  terminalWindow.style.transition = 'opacity 600ms ease';
  terminalWindow.style.opacity = '0';
  await sleep(700);
  terminalWindow.style.opacity = '1';
  runTerminal();
}

function initTerminal() {
  setTimeout(() => {
    terminalWindow.classList.add('visible');
    setTimeout(() => {
      runTerminal();
    }, 600);
  }, 400);
}

/* ==========================================================
   INTERSECTION OBSERVER — REVEAL ANIMATIONS
   ========================================================== */
const featureRows = document.querySelectorAll('.feature-row');
const githubSection = document.getElementById('github-section');

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      if (entry.target.classList.contains('feature-row')) {
        const index = Array.from(featureRows).indexOf(entry.target);
        const delay = index * 40;
        entry.target.style.transitionDelay = delay + 'ms';
      }
      entry.target.classList.add('revealed');
      revealObserver.unobserve(entry.target);
    }
  });
}, {
  threshold: 0.15,
  rootMargin: '0px 0px -40px 0px'
});

featureRows.forEach(row => revealObserver.observe(row));
if (githubSection) revealObserver.observe(githubSection);

/* ==========================================================
   INIT
   ========================================================== */
window.addEventListener('DOMContentLoaded', () => {
  loadRelease();
  
  if (prefersReducedMotion) {
    terminalWindow.classList.add('visible');
    runTerminal();
    featureRows.forEach(row => row.classList.add('revealed'));
    if (githubSection) githubSection.classList.add('revealed');
  } else {
    initTerminal();
  }
});
