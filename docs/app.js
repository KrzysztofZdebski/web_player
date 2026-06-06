/**
 * HLS Stream Player — app.js
 *
 * Features:
 *  - hls.js playback with native HLS fallback
 *  - Predefined playlist list + custom URL input
 *  - Manual bitrate switching + Auto mode
 *  - Bitrate / resolution / codec diagnostics
 *  - Real-time buffer bar and playback stats
 *  - Typed & filtered request log
 *  - Persistent custom playlist list (localStorage)
 *  - Geo / IP access control demo (browser-only, NOT server-enforced)
 */

/* ═══ DOM references ════════════════════════════════════════════ */
const video           = document.getElementById('video');
const videoShell      = document.getElementById('video-shell');
const videoOverlay    = document.getElementById('video-overlay');
const sourceForm      = document.getElementById('source-form');
const sourceSelect    = document.getElementById('source-select');
const customUrlInput  = document.getElementById('custom-url');
const loadBtn         = document.getElementById('load-btn');
const saveCustomBtn   = document.getElementById('save-custom-btn');
const savedPanel      = document.getElementById('saved-panel');
const savedList       = document.getElementById('saved-list');
const savedOptgroup   = document.getElementById('saved-optgroup');
const clearSavedBtn   = document.getElementById('clear-saved-btn');
const statusText      = document.getElementById('status');
const statusDot       = document.getElementById('status-dot');
const requestLog      = document.getElementById('request-log');
const clearLogBtn     = document.getElementById('clear-log-btn');
const qualityControls = document.getElementById('quality-controls');
const hlsVersionBadge = document.getElementById('hls-version');
const engineBadge     = document.getElementById('engine-badge');
const terminalFeedStatus = document.getElementById('terminal-feed-status');
const geoOverlay      = document.getElementById('geo-overlay');
const geoMessage      = document.getElementById('geo-message');
const geoOverrideBtn  = document.getElementById('geo-override');
const geoInfo         = document.getElementById('geo-info');
const geoFlag         = document.getElementById('geo-flag');
const geoCountry      = document.getElementById('geo-country');
const bufferBar       = document.getElementById('buffer-bar');
const bufferBarLabel  = document.getElementById('buffer-bar-label');
const filterBtns      = document.querySelectorAll('.filter-btn');

const metrics = {
  bitrate:    document.getElementById('metric-bitrate'),
  resolution: document.getElementById('metric-resolution'),
  videoCodec: document.getElementById('metric-video-codec'),
  audioCodec: document.getElementById('metric-audio-codec'),
  fps:        document.getElementById('metric-fps'),
};

const stats = {
  buffered:  document.getElementById('stat-buffered'),
  dropped:   document.getElementById('stat-dropped'),
  rate:      document.getElementById('stat-rate'),
  segments:  document.getElementById('stat-segments'),
};

/* ═══ State ═════════════════════════════════════════════════════ */
let hls          = null;
let activeFilter = 'all';
let segmentCount = 0;
let statsInterval = null;
const MAX_LOG_ENTRIES = 60;
const LS_KEY = 'hls-player-saved';

/* Geo demo: countries to "block" */
const DEMO_BLOCKED_COUNTRIES = ['XX', 'YY']; // placeholder codes — change to test

/* ═══ Utility helpers ═══════════════════════════════════════════ */
function formatBitrate(bps) {
  if (!bps) return '—';
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(2)} Mbps`;
  return `${Math.round(bps / 1000)} kbps`;
}

function formatSeconds(s) {
  if (!isFinite(s) || s < 0) return '—';
  return `${s.toFixed(1)} s`;
}

function now() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
}

function levelLabel(level, index) {
  const h = level.height ? `${level.height}p` : `L${index}`;
  return `${h} · ${formatBitrate(level.bitrate)}`;
}

function urlType(url) {
  if (!url) return 'other';
  const u = url.split('?')[0].toLowerCase();
  if (u.endsWith('.m3u8')) return 'm3u8';
  if (u.endsWith('.ts') || u.endsWith('.aac') || u.endsWith('.mp4') || u.endsWith('.cmfv') || u.endsWith('.cmfa')) return 'ts';
  return 'other';
}

/* ═══ Status ════════════════════════════════════════════════════ */
function setStatus(msg, state = 'idle') {
  statusText.textContent = msg;
  statusDot.className = `status-dot ${state}`;
  statusText.className = `status-text${state === 'error' ? ' error' : ''}`;
}

/* ═══ Metrics ═══════════════════════════════════════════════════ */
function resetMetrics() {
  metrics.bitrate.textContent    = '—';
  metrics.resolution.textContent = '—';
  metrics.videoCodec.textContent = '—';
  metrics.audioCodec.textContent = '—';
  metrics.fps.textContent        = '—';
  stats.buffered.textContent     = '—';
  stats.dropped.textContent      = '—';
  stats.rate.textContent         = '—';
  segmentCount = 0;
  stats.segments.textContent     = '0';
  bufferBar.style.width          = '0%';
  bufferBarLabel.textContent     = '0 s';
}

function updateMetrics(levelIndex) {
  // Resolution from video element as fallback
  if (!hls || !hls.levels || levelIndex < 0) {
    if (video.videoWidth && video.videoHeight) {
      metrics.resolution.textContent = `${video.videoWidth} × ${video.videoHeight}`;
      if (terminalFeedStatus) terminalFeedStatus.textContent = `${video.videoWidth}×${video.videoHeight} // LIVE`;
    }
    return;
  }
  const level = hls.levels[levelIndex];
  if (!level) return;

  metrics.bitrate.textContent    = formatBitrate(level.bitrate);
  metrics.resolution.textContent = level.width && level.height
    ? `${level.width} × ${level.height}`
    : '—';
  if (terminalFeedStatus && level.width && level.height) {
    terminalFeedStatus.textContent = `${level.width}×${level.height} // ABR`;
  }
  metrics.videoCodec.textContent = level.videoCodec || level.codecSet || '—';
  metrics.audioCodec.textContent = level.audioCodec || '—';

  if (level.attrs && level.attrs['FRAME-RATE']) {
    metrics.fps.textContent = `${parseFloat(level.attrs['FRAME-RATE']).toFixed(3)} fps`;
  } else {
    metrics.fps.textContent = '—';
  }
}

function tickStats() {
  /* Buffer */
  let bufSec = 0;
  if (video.buffered.length > 0 && video.currentTime >= 0) {
    const end = video.buffered.end(video.buffered.length - 1);
    bufSec = Math.max(0, end - video.currentTime);
  }
  const maxBuf = 30;
  const pct = Math.min(100, (bufSec / maxBuf) * 100);
  bufferBar.style.width     = `${pct}%`;
  bufferBarLabel.textContent = formatSeconds(bufSec);
  stats.buffered.textContent = formatSeconds(bufSec);

  /* Dropped frames */
  if (video.getVideoPlaybackQuality) {
    const q = video.getVideoPlaybackQuality();
    stats.dropped.textContent = q.droppedVideoFrames.toString();
  }

  /* Playback rate */
  stats.rate.textContent = video.paused ? 'Paused' : `${video.playbackRate}×`;
}

/* ═══ Quality controls ══════════════════════════════════════════ */
function renderQualityControls() {
  qualityControls.replaceChildren();

  const autoBtn = document.createElement('button');
  autoBtn.type = 'button';
  autoBtn.id = 'auto-btn';
  autoBtn.className = 'quality-btn';
  autoBtn.textContent = 'Auto';
  autoBtn.dataset.level = '-1';
  autoBtn.classList.toggle('active', !hls || hls.currentLevel === -1);
  autoBtn.addEventListener('click', () => {
    if (!hls) return;
    hls.currentLevel = -1;
    setStatus('Auto quality selection', 'playing');
    renderQualityControls();
  });
  qualityControls.append(autoBtn);

  if (!hls || !hls.levels || hls.levels.length === 0) return;

  hls.levels.forEach((level, index) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'quality-btn';
    btn.dataset.level = index;
    btn.textContent = levelLabel(level, index);
    btn.classList.toggle('active', hls.currentLevel === index);
    btn.addEventListener('click', () => {
      hls.currentLevel = index;
      setStatus(`Manual: ${levelLabel(level, index)}`, 'playing');
      updateMetrics(index);
      renderQualityControls();
    });
    qualityControls.append(btn);
  });
}

/* ═══ Request log ═══════════════════════════════════════════════ */
function logRequest(url) {
  if (!url) return;
  const type  = urlType(url);
  const entry = document.createElement('li');
  entry.className = 'log-entry';
  entry.dataset.type = type;

  const badge = document.createElement('span');
  badge.className = `log-type log-type-${type}`;
  badge.textContent = type === 'm3u8' ? 'm3u8' : type === 'ts' ? '.ts' : 'req';

  const urlSpan = document.createElement('span');
  urlSpan.className = 'log-url';
  // Show only last 2 path segments for brevity
  try {
    const parsed = new URL(url, location.href);
    const parts  = parsed.pathname.split('/').filter(Boolean);
    urlSpan.textContent = parts.slice(-2).join('/') || url;
    urlSpan.title = url;
  } catch {
    urlSpan.textContent = url;
  }

  const timeSpan = document.createElement('span');
  timeSpan.className = 'log-time';
  timeSpan.textContent = now();

  entry.append(badge, urlSpan, timeSpan);

  // Apply current filter
  if (activeFilter !== 'all' && type !== activeFilter) {
    entry.hidden = true;
  }

  requestLog.prepend(entry);
  while (requestLog.children.length > MAX_LOG_ENTRIES) {
    requestLog.lastElementChild.remove();
  }
}

/* ═══ Filter buttons ════════════════════════════════════════════ */
filterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    filterBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.dataset.filter;

    Array.from(requestLog.children).forEach(entry => {
      if (activeFilter === 'all') {
        entry.hidden = false;
      } else {
        entry.hidden = entry.dataset.type !== activeFilter;
      }
    });
  });
});

clearLogBtn.addEventListener('click', () => {
  requestLog.replaceChildren();
});

/* ═══ hls.js engine ═════════════════════════════════════════════ */
function attachHlsEvents(instance) {
  instance.on(Hls.Events.MANIFEST_LOADING, (_e, data) => {
    logRequest(data.url);
    setStatus('Loading manifest…', 'loading');
  });

  instance.on(Hls.Events.LEVEL_LOADING, (_e, data) => {
    logRequest(data.url);
  });

  instance.on(Hls.Events.FRAG_LOADING, (_e, data) => {
    logRequest(data.frag && data.frag.url);
    segmentCount++;
    stats.segments.textContent = segmentCount.toString();
  });

  instance.on(Hls.Events.MANIFEST_PARSED, () => {
    setStatus('Manifest loaded — playing', 'playing');
    renderQualityControls();
    updateMetrics(instance.currentLevel);
    video.play().catch(() => {
      setStatus('Manifest loaded. Press ▶ to play.', 'idle');
    });
  });

  instance.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => {
    updateMetrics(data.level);
    renderQualityControls();
  });

  instance.on(Hls.Events.ERROR, (_e, data) => {
    const detail = data.details || data.type || 'unknown error';
    if (data.fatal) {
      setStatus(`Fatal error: ${detail}`, 'error');
    } else {
      setStatus(`Warning: ${detail}`, 'loading');
    }
    console.warn('[hls.js]', data);
  });
}

function destroyHls() {
  if (hls) {
    hls.destroy();
    hls = null;
  }
  if (statsInterval) {
    clearInterval(statsInterval);
    statsInterval = null;
  }
}

/* ═══ Load source ═══════════════════════════════════════════════ */
function loadSource(url) {
  destroyHls();
  resetMetrics();
  requestLog.replaceChildren();
  video.removeAttribute('src');
  video.load();
  videoOverlay.hidden = true;

  setStatus('Initialising…', 'loading');
  if (terminalFeedStatus) terminalFeedStatus.textContent = 'CONNECTING';

  /* ── hls.js path ── */
  if (window.Hls && Hls.isSupported()) {
    engineBadge.textContent = `hls.js ${Hls.version || ''}`;
    if (terminalFeedStatus) terminalFeedStatus.textContent = 'MSE READY';
    hls = new Hls({
      capLevelToPlayerSize: false,
      enableWorker:        true,
      maxBufferLength:     30,
    });
    attachHlsEvents(hls);
    hls.loadSource(url);
    hls.attachMedia(video);
    renderQualityControls();

    statsInterval = setInterval(tickStats, 1000);
    return;
  }

  /* ── Native HLS path (Safari) ── */
  if (video.canPlayType('application/vnd.apple.mpegurl')) {
    engineBadge.textContent = 'Native HLS';
    if (terminalFeedStatus) terminalFeedStatus.textContent = 'NATIVE HLS';
    video.src = url;
    logRequest(url);
    setStatus('Native HLS playback', 'playing');
    video.play().catch(() => setStatus('Source loaded. Press ▶ to play.', 'idle'));
    renderQualityControls();
    statsInterval = setInterval(tickStats, 1000);
    return;
  }

  /* ── No HLS support ── */
  engineBadge.textContent = 'Unsupported';
  if (terminalFeedStatus) terminalFeedStatus.textContent = 'UNSUPPORTED';
  setStatus('This browser does not support HLS playback.', 'error');
  renderQualityControls();
}

/* ═══ Form events ═══════════════════════════════════════════════ */
sourceForm.addEventListener('submit', e => {
  e.preventDefault();
  const url = customUrlInput.value.trim() || sourceSelect.value;
  if (url) loadSource(url);
});

sourceSelect.addEventListener('change', () => {
  customUrlInput.value = '';
  loadSource(sourceSelect.value);
});

/* ═══ Video element events ══════════════════════════════════════ */
video.addEventListener('loadedmetadata', () => {
  if (!hls) {
    metrics.resolution.textContent = `${video.videoWidth} × ${video.videoHeight}`;
  }
});

video.addEventListener('waiting', () => {
  videoOverlay.hidden = false;
  setStatus('Buffering…', 'loading');
  if (terminalFeedStatus) terminalFeedStatus.textContent = 'BUFFERING';
});

video.addEventListener('playing', () => {
  videoOverlay.hidden = true;
  setStatus('Playing', 'playing');
  if (terminalFeedStatus && video.videoWidth && video.videoHeight) {
    terminalFeedStatus.textContent = `${video.videoWidth}×${video.videoHeight} // LIVE`;
  }
});

video.addEventListener('pause', () => {
  if (!video.ended) {
    setStatus('Paused', 'idle');
    if (terminalFeedStatus) terminalFeedStatus.textContent = 'PAUSED';
  }
});

video.addEventListener('ended', () => {
  setStatus('Playback ended', 'idle');
  videoOverlay.hidden = true;
  if (terminalFeedStatus) terminalFeedStatus.textContent = 'ENDED';
});

video.addEventListener('error', () => {
  setStatus('Video element error', 'error');
  videoOverlay.hidden = true;
  if (terminalFeedStatus) terminalFeedStatus.textContent = 'ERROR';
});

/* ═══ hls.js version badge ══════════════════════════════════════ */
if (window.Hls) {
  hlsVersionBadge.textContent = `hls.js ${Hls.version || '1.x'}`;
  engineBadge.textContent = Hls.isSupported() ? 'MSE ready' : 'MSE unavailable';
} else {
  hlsVersionBadge.textContent = 'hls.js (loading…)';
  engineBadge.textContent = 'Detecting…';
}

/* ═══ Persistent custom playlists ═══════════════════════════════ */
function loadSaved() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '[]');
  } catch {
    return [];
  }
}

function persistSaved(list) {
  localStorage.setItem(LS_KEY, JSON.stringify(list));
}

function renderSavedList() {
  const saved = loadSaved();
  savedList.replaceChildren();
  savedOptgroup.replaceChildren();

  if (saved.length === 0) {
    savedPanel.hidden = true;
    savedOptgroup.hidden = true;
    return;
  }

  savedPanel.hidden = false;
  savedOptgroup.hidden = false;

  saved.forEach((url, i) => {
    /* Sidebar list item */
    const li = document.createElement('li');
    li.className = 'saved-item';

    const urlSpan = document.createElement('span');
    urlSpan.className = 'saved-item-url';
    urlSpan.textContent = url;
    urlSpan.title = 'Click to load';
    urlSpan.addEventListener('click', () => loadSource(url));

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'saved-item-del';
    del.textContent = '✕';
    del.title = 'Remove';
    del.setAttribute('aria-label', `Remove ${url}`);
    del.addEventListener('click', () => {
      const list = loadSaved();
      list.splice(i, 1);
      persistSaved(list);
      renderSavedList();
    });

    li.append(urlSpan, del);
    savedList.append(li);

    /* Optgroup option */
    const opt = document.createElement('option');
    opt.value = url;
    try {
      const parsed = new URL(url);
      opt.textContent = parsed.pathname.split('/').pop() || url;
    } catch {
      opt.textContent = url;
    }
    savedOptgroup.append(opt);
  });
}

saveCustomBtn.addEventListener('click', () => {
  const url = customUrlInput.value.trim();
  if (!url) return;
  const saved = loadSaved();
  if (!saved.includes(url)) {
    saved.unshift(url);
    if (saved.length > 20) saved.length = 20; // cap at 20 entries
    persistSaved(saved);
    renderSavedList();
  }
  loadSource(url);
});

clearSavedBtn.addEventListener('click', () => {
  persistSaved([]);
  renderSavedList();
});

renderSavedList();

/* ═══ Geo / IP access control (BROWSER-ONLY DEMO) ══════════════
 *
 * WARNING: This is a browser-side demonstration ONLY.
 * It is trivially bypassable by any user with developer tools.
 * No server-side content protection is applied.
 * It is included to illustrate how a geo-restriction UI could look.
 *
 ═══════════════════════════════════════════════════════════════ */
async function checkGeoAccess() {
  try {
    const ipRes   = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(4000) });
    const { ip }  = await ipRes.json();
    const geoRes  = await fetch(`https://ipapi.co/${ip}/json/`, { signal: AbortSignal.timeout(4000) });
    const geo     = await geoRes.json();

    const country = geo.country_code || geo.country || '??';
    const name    = geo.country_name  || country;
    const flag    = countryToFlag(country);

    geoFlag.textContent    = flag;
    geoCountry.textContent = `${name} (${country}) — ${ip}`;
    geoInfo.hidden = false;

    if (DEMO_BLOCKED_COUNTRIES.includes(country)) {
      geoMessage.textContent = `Content is not available in ${name} (${country}) — browser demo.`;
      geoOverlay.hidden = false;
    }
  } catch (err) {
    /* Geo check failed silently — do not block playback */
    console.info('[geo] check unavailable:', err.message);
  }
}

function countryToFlag(code) {
  if (!code || code.length !== 2) return '🌍';
  try {
    return String.fromCodePoint(
      ...code.toUpperCase().split('').map(c => 127397 + c.charCodeAt(0))
    );
  } catch {
    return '🌍';
  }
}

geoOverrideBtn.addEventListener('click', () => {
  geoOverlay.hidden = true;
});

/* Start geo check asynchronously — does not block player */
checkGeoAccess();

/* ═══ Boot ══════════════════════════════════════════════════════ */
loadSource(sourceSelect.value);
