// Vice City Cover Studio — offline GTA-style poster maker.
// One module, no libraries, no network: every photo is read on the machine
// with FileReader, every pixel of the cover is drawn on a 2D canvas.

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- state

const EXPORT_SIZES = {
  '1920x1080': { w: 1920, h: 1080, label: 'wide' },
  '1080x1080': { w: 1080, h: 1080, label: 'square' },
  '1080x1350': { w: 1080, h: 1350, label: 'portrait' },
};

// One panel config per panel slot; a layout uses the first N of them.
function freshPanel(photo) {
  return { photo, zoom: 1, ox: 0, oy: 0, fit: 'cover' };
}

const state = {
  layout: 'diagonal',
  grade: 'sunset',
  size: '1920x1080',
  title: 'NEON SHORE',
  tagline: 'Sunset heist on the coast',
  titleColor: '#ffffff',
  outline: true,
  titlePos: 'bottom',
  // photos[0..2] are HTMLImageElement or null; slot -1 means "sunset artwork".
  photos: [null, null, null],
  panels: [freshPanel(0), freshPanel(1), freshPanel(2), freshPanel(0)],
  selected: 0,
};

const SAMPLES = {
  boulevard: 'samples/boulevard.jpg',
  pier: 'samples/pier.jpg',
};

// ---------------------------------------------------------------- layouts

// Every layout is a list of polygons in unit coordinates, so the same
// geometry draws at preview size and at full export size.
const LAYOUTS = {
  diagonal: {
    name: 'Diagonal Split',
    panels: [
      [[0, 0], [0.6, 0], [0.46, 1], [0, 1]],
      [[0.6, 0], [1, 0], [1, 1], [0.46, 1]],
    ],
  },
  trio: {
    name: 'Hero + Two',
    panels: [
      [[0, 0], [0.52, 0], [0.52, 1], [0, 1]],
      [[0.52, 0], [1, 0], [1, 0.5], [0.52, 0.5]],
      [[0.52, 0.5], [1, 0.5], [1, 1], [0.52, 1]],
    ],
  },
  hero: {
    name: 'Single Hero',
    panels: [[[0, 0], [1, 0], [1, 1], [0, 1]]],
  },
  grid: {
    name: 'Four Grid',
    panels: [
      [[0, 0], [0.5, 0], [0.5, 0.5], [0, 0.5]],
      [[0.5, 0], [1, 0], [1, 0.5], [0.5, 0.5]],
      [[0, 0.5], [0.5, 0.5], [0.5, 1], [0, 1]],
      [[0.5, 0.5], [1, 0.5], [1, 1], [0.5, 1]],
    ],
  },
};

function layoutPanels() {
  return LAYOUTS[state.layout].panels;
}

function panelBounds(poly) {
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
  for (const [x, y] of poly) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y);
    x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function pointInPolygon(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// ---------------------------------------------------------------- grades

// Each grade is a per-pixel colour recipe plus a wash gradient drawn over
// the finished cover. Values are small multipliers, so no photo blows out.
const GRADES = {
  sunset: {
    sat: 1.28, con: 1.08, bright: 1.03, r: 1.12, g: 1.0, b: 0.9,
    shadow: [46, 12, 66], highlight: [255, 176, 92],
    wash: ['#ff2e88', '#ff9a3d'], washAlpha: 0.16, accent: '#ff9a3d',
  },
  neon: {
    sat: 1.45, con: 1.12, bright: 1.0, r: 0.94, g: 1.06, b: 1.16,
    shadow: [8, 42, 64], highlight: [255, 92, 200],
    wash: ['#00e5ff', '#ff2e88'], washAlpha: 0.18, accent: '#00e5ff',
  },
  pastel: {
    sat: 0.9, con: 0.95, bright: 1.07, r: 1.06, g: 0.98, b: 1.1,
    shadow: [96, 74, 128], highlight: [255, 224, 204],
    wash: ['#ffb3d9', '#ffd9a0'], washAlpha: 0.14, accent: '#ff8fc7',
  },
  noir: {
    sat: 0.0, con: 1.26, bright: 1.0, r: 1.0, g: 1.0, b: 1.0,
    shadow: [18, 18, 24], highlight: [255, 250, 240],
    wash: ['#ffffff', '#000000'], washAlpha: 0.06, accent: '#ffffff',
  },
};

// Deterministic grain: the same seed every run, so two exports match.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let grainCanvas = null;
function getGrainCanvas() {
  if (grainCanvas) return grainCanvas;
  const rand = mulberry32(20261119);
  const c = document.createElement('canvas');
  c.width = 160; c.height = 160;
  const g = c.getContext('2d');
  const img = g.createImageData(160, 160);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(rand() * 255);
    img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  grainCanvas = c;
  return c;
}

// ---------------------------------------------------------------- photo draw

function drawPhotoInto(ctx, img, x, y, w, h, panel) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const base = panel.fit === 'contain'
    ? Math.min(w / iw, h / ih)
    : Math.max(w / iw, h / ih);
  const scale = base * panel.zoom;
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = x + (w - dw) / 2 + panel.ox * w;
  const dy = y + (h - dh) / 2 + panel.oy * h;
  ctx.drawImage(img, dx, dy, dw, dh);
}

// A panel with no photo gets original sunset artwork: gradient sky, a sun,
// a skyline silhouette and a palm line — drawn, never borrowed.
function drawSunsetArtwork(ctx, x, y, w, h, grade) {
  const sky = ctx.createLinearGradient(0, y, 0, y + h);
  sky.addColorStop(0, '#2b0a4a');
  sky.addColorStop(0.45, '#c2185b');
  sky.addColorStop(0.75, '#ff7a3d');
  sky.addColorStop(1, '#ffd400');
  ctx.fillStyle = sky;
  ctx.fillRect(x, y, w, h);
  const cx = x + w * 0.5;
  const cy = y + h * 0.42;
  const r = Math.min(w, h) * 0.2;
  const glow = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 2.2);
  glow.addColorStop(0, 'rgba(255, 220, 120, 0.9)');
  glow.addColorStop(1, 'rgba(255, 220, 120, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#fff3c4';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  // Sun slats, poster style.
  ctx.fillStyle = 'rgba(194, 24, 91, 0.55)';
  for (let i = 0; i < 3; i++) {
    const sy = cy + r * (0.15 + i * 0.28);
    ctx.fillRect(cx - r, sy, r * 2, Math.max(2, r * 0.07));
  }
  // Skyline silhouette.
  ctx.fillStyle = '#160a24';
  const base = y + h;
  let bx = x;
  const rand = mulberry32(7 + Math.floor(w));
  while (bx < x + w) {
    const bw = w * (0.08 + rand() * 0.14);
    const bh = h * (0.12 + rand() * 0.3);
    ctx.fillRect(bx, base - bh, bw, bh);
    bx += bw + w * 0.02;
  }
  void grade;
}

function tracePolygon(ctx, poly, W, H) {
  ctx.beginPath();
  poly.forEach(([px, py], i) => {
    if (i === 0) ctx.moveTo(px * W, py * H);
    else ctx.lineTo(px * W, py * H);
  });
  ctx.closePath();
}

function drawPanel(ctx, poly, panel, W, H) {
  const b = panelBounds(poly);
  const x = b.x * W, y = b.y * H, w = b.w * W, h = b.h * H;
  ctx.save();
  tracePolygon(ctx, poly, W, H);
  ctx.clip();
  const img = panel.photo >= 0 ? state.photos[panel.photo] : null;
  if (img) drawPhotoInto(ctx, img, x, y, w, h, panel);
  else drawSunsetArtwork(ctx, x, y, w, h, GRADES[state.grade]);
  ctx.restore();
  // White gutter around the panel, poster style.
  ctx.save();
  tracePolygon(ctx, poly, W, H);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.lineWidth = Math.max(3, W * 0.004);
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- grade pass

function applyGradePreset(ctx, W, H) {
  const g = GRADES[state.grade];
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  const con = g.con;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i] * g.bright;
    let gg = d[i + 1] * g.bright;
    let b = d[i + 2] * g.bright;
    // Linear contrast around mid-grey (the textbook 259-factor form
    // inverts once the factor passes 1.0, so it is not used here).
    r = (r - 128) * con + 128;
    gg = (gg - 128) * con + 128;
    b = (b - 128) * con + 128;
    // Saturation.
    const lum = 0.299 * r + 0.587 * gg + 0.114 * b;
    r = lum + (r - lum) * g.sat;
    gg = lum + (gg - lum) * g.sat;
    b = lum + (b - lum) * g.sat;
    // Channel multipliers, then shadow / highlight tints by luminance.
    r *= g.r; gg *= g.g; b *= g.b;
    const l = Math.max(0, Math.min(1, lum / 255));
    const sh = Math.pow(1 - l, 2) * 0.22;
    const hi = Math.pow(l, 2.4) * 0.18;
    r += (g.shadow[0] - r) * sh + (g.highlight[0] - r) * hi;
    gg += (g.shadow[1] - gg) * sh + (g.highlight[1] - gg) * hi;
    b += (g.shadow[2] - b) * sh + (g.highlight[2] - b) * hi;
    d[i] = Math.max(0, Math.min(255, r));
    d[i + 1] = Math.max(0, Math.min(255, gg));
    d[i + 2] = Math.max(0, Math.min(255, b));
  }
  ctx.putImageData(img, 0, 0);
}

// ---------------------------------------------------------------- overlays

function drawCoverOverlays(ctx, W, H) {
  const g = GRADES[state.grade];
  // Diagonal wash in the grade's two colours.
  const wash = ctx.createLinearGradient(0, 0, W, H);
  wash.addColorStop(0, g.wash[0]);
  wash.addColorStop(1, g.wash[1]);
  ctx.save();
  ctx.globalAlpha = g.washAlpha;
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  // Vignette.
  const vig = ctx.createRadialGradient(
    W / 2, H / 2, Math.min(W, H) * 0.35,
    W / 2, H / 2, Math.max(W, H) * 0.75,
  );
  vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vig.addColorStop(1, 'rgba(10, 4, 24, 0.42)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
  // Grain.
  const grain = ctx.createPattern(getGrainCanvas(), 'repeat');
  if (grain) {
    ctx.save();
    ctx.globalAlpha = 0.05;
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = grain;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  // Halftone dots along the bottom edge, poster-print feel.
  const bandH = Math.max(8, H * 0.045);
  const step = Math.max(10, W * 0.012);
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
  for (let yy = H - bandH; yy < H; yy += step) {
    for (let xx = step / 2; xx < W; xx += step) {
      const r = Math.max(1, step * 0.14 * (1 - (yy - (H - bandH)) / bandH));
      ctx.beginPath();
      ctx.arc(xx, yy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// Small original sun badge, drawn with canvas paths — no borrowed mark.
function drawSunBadge(ctx, W, H) {
  const g = GRADES[state.grade];
  const cx = W - W * 0.075;
  const cy = H * 0.085;
  const r = Math.min(W, H) * 0.042;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(2, r * 0.08);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = g.accent;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.75, Math.sin(a) * r * 0.75);
    ctx.lineTo(Math.cos(a) * r * 1.15, Math.sin(a) * r * 1.15);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCoverLettering(ctx, W, H) {
  const g = GRADES[state.grade];
  const title = (state.title || 'NEON SHORE').toUpperCase();
  const tagline = state.tagline || '';
  const top = state.titlePos === 'top';
  const titleSize = Math.round(W * (title.length > 14 ? 0.085 : 0.105));
  const tagSize = Math.round(W * 0.026);
  const bandY = top ? H * 0.06 : H * 0.9;
  const tagY = top ? bandY + titleSize * 1.15 : bandY - titleSize * 1.05;
  const titleY = top ? bandY + titleSize * 0.5 : bandY - titleSize * 0.12;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Tagline first (sits above/below the title), letterspaced, glowing accent.
  if (tagline) {
    ctx.font = `700 ${tagSize}px Arial, Helvetica, sans-serif`;
    try { ctx.letterSpacing = `${Math.round(tagSize * 0.28)}px`; } catch (e) { /* older canvas */ }
    ctx.shadowColor = g.accent;
    ctx.shadowBlur = tagSize * 0.9;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(tagline.toUpperCase(), W / 2, tagY);
    ctx.shadowBlur = 0;
    try { ctx.letterSpacing = '0px'; } catch (e) { /* older canvas */ }
  }
  // Main title: heavy system blackletter-style stack, outlined, slight tilt.
  ctx.translate(W / 2, titleY);
  ctx.rotate(-0.022);
  ctx.font = `900 ${titleSize}px "Arial Black", Impact, "Helvetica Neue", sans-serif`;
  try { ctx.letterSpacing = `${Math.round(titleSize * 0.02)}px`; } catch (e) { /* older canvas */ }
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = titleSize * 0.12;
  ctx.shadowOffsetY = titleSize * 0.05;
  if (state.outline) {
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#12061f';
    ctx.lineWidth = Math.max(4, titleSize * 0.16);
    ctx.strokeText(title, 0, 0);
  }
  ctx.fillStyle = state.titleColor;
  ctx.fillText(title, 0, 0);
  ctx.restore();
}

// White poster frame with a thin accent inner line.
function drawCoverFrame(ctx, W, H) {
  const g = GRADES[state.grade];
  const bw = Math.max(6, Math.round(W * 0.008));
  ctx.save();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = bw;
  ctx.strokeRect(bw / 2, bw / 2, W - bw, H - bw);
  ctx.strokeStyle = g.accent;
  ctx.lineWidth = Math.max(2, bw * 0.25);
  ctx.strokeRect(bw * 1.6, bw * 1.6, W - bw * 3.2, H - bw * 3.2);
  ctx.restore();
}

// The whole cover: panels, grade, overlays, lettering, badge, frame.
function renderCover(ctx, W, H) {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#12061f';
  ctx.fillRect(0, 0, W, H);
  const polys = layoutPanels();
  polys.forEach((poly, i) => drawPanel(ctx, poly, state.panels[i], W, H));
  applyGradePreset(ctx, W, H);
  drawCoverOverlays(ctx, W, H);
  drawSunBadge(ctx, W, H);
  drawCoverLettering(ctx, W, H);
  drawCoverFrame(ctx, W, H);
}

// ---------------------------------------------------------------- preview

const preview = $('preview');
let previewRaf = 0;

function previewSize() {
  const size = EXPORT_SIZES[state.size];
  const ratio = size.w / size.h;
  const w = 960;
  return { w, h: Math.round(w / ratio) };
}

function schedulePreview() {
  if (previewRaf) return;
  previewRaf = requestAnimationFrame(() => {
    previewRaf = 0;
    const { w, h } = previewSize();
    if (preview.width !== w || preview.height !== h) {
      preview.width = w;
      preview.height = h;
    }
    const ctx = preview.getContext('2d', { willReadFrequently: true });
    renderCover(ctx, w, h);
    syncPanelControls();
  });
}

function syncPanelControls() {
  const panel = state.panels[state.selected];
  $('panelPhoto').value = String(panel.photo);
  $('panelZoom').value = String(panel.zoom);
  $('panelFit').value = panel.fit;
  $('panelChip').textContent =
    `Panel ${state.selected + 1} of ${layoutPanels().length} — ` +
    (panel.photo >= 0 ? `Photo ${panel.photo + 1}` : 'sunset artwork') +
    ' — drag to move the photo, scroll to zoom';
  document.querySelectorAll('#layoutGrid .layout-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.layout === state.layout);
  });
  document.querySelectorAll('#gradeGrid .grade-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.grade === state.grade);
  });
  document.querySelectorAll('#sizeGrid .size-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.size === state.size);
  });
}

// ---------------------------------------------------------------- photos

function loadImageFromUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${url}`));
    img.src = url;
  });
}

function setPhotoSlot(slot, img) {
  state.photos[slot] = img;
  const thumb = $(`thumb${slot}`);
  thumb.classList.add('loaded');
  thumb.textContent = '';
  const small = document.createElement('img');
  small.src = img.src;
  small.alt = `Photo ${slot + 1}`;
  thumb.appendChild(small);
  schedulePreview();
}

async function loadSampleIntoSlot(name, slot) {
  try {
    const img = await loadImageFromUrl(SAMPLES[name]);
    setPhotoSlot(slot, img);
    return true;
  } catch (e) {
    $('exportStatus').textContent = `Sample ${name} failed to load — upload a photo instead.`;
    return false;
  }
}

function readUploadFile(file, slot) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      setPhotoSlot(slot, img);
      // New uploads take over the selected panel's photo slot.
      state.panels[state.selected].photo = slot;
      schedulePreview();
    };
    img.src = String(reader.result);
  };
  reader.readAsDataURL(file);
}

// ---------------------------------------------------------------- export

function exportCoverPNG() {
  const size = EXPORT_SIZES[state.size];
  const off = document.createElement('canvas');
  off.width = size.w;
  off.height = size.h;
  const ctx = off.getContext('2d', { willReadFrequently: true });
  renderCover(ctx, size.w, size.h);
  return new Promise((resolve) => {
    off.toBlob((blob) => resolve(blob), 'image/png');
  });
}

async function doExport() {
  const status = $('exportStatus');
  status.textContent = 'Rendering your cover…';
  try {
    const blob = await exportCoverPNG();
    if (!blob) throw new Error('the canvas gave no PNG');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vice-city-cover-${state.size}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    status.textContent = `Exported ${state.size} PNG (${(blob.size / 1024).toFixed(0)} KiB). Share it anywhere.`;
  } catch (e) {
    status.textContent = `Export failed: ${e.message}`;
  }
}

// Exposed for screenshots and automation: render + export from one handle.
window.__coverStudio = {
  state,
  renderCover,
  exportCoverPNG,
  loadSampleIntoSlot,
};

// ---------------------------------------------------------------- editor events

function bindEditor() {
  [0, 1, 2].forEach((slot) => {
    $(`file${slot}`).addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) readUploadFile(file, slot);
    });
  });

  $('btnSampleBoulevard').addEventListener('click', () => loadSampleIntoSlot('boulevard', 0));
  $('btnSamplePier').addEventListener('click', () => loadSampleIntoSlot('pier', 1));
  $('btnSampleAll').addEventListener('click', async () => {
    await loadSampleIntoSlot('boulevard', 0);
    await loadSampleIntoSlot('pier', 1);
    state.panels[0].photo = 0;
    state.panels[1].photo = 1;
    schedulePreview();
  });

  document.querySelectorAll('#layoutGrid .layout-btn').forEach((b) => {
    b.addEventListener('click', () => {
      state.layout = b.dataset.layout;
      if (state.selected >= layoutPanels().length) state.selected = 0;
      schedulePreview();
    });
  });

  document.querySelectorAll('#gradeGrid .grade-btn').forEach((b) => {
    b.addEventListener('click', () => {
      state.grade = b.dataset.grade;
      schedulePreview();
    });
  });

  document.querySelectorAll('#sizeGrid .size-btn').forEach((b) => {
    b.addEventListener('click', () => {
      state.size = b.dataset.size;
      schedulePreview();
    });
  });

  $('panelPhoto').addEventListener('change', (e) => {
    state.panels[state.selected].photo = Number(e.target.value);
    schedulePreview();
  });
  $('panelZoom').addEventListener('input', (e) => {
    state.panels[state.selected].zoom = Number(e.target.value);
    schedulePreview();
  });
  $('panelFit').addEventListener('change', (e) => {
    state.panels[state.selected].fit = e.target.value;
    schedulePreview();
  });
  $('btnResetCrop').addEventListener('click', () => {
    const p = state.panels[state.selected];
    p.zoom = 1; p.ox = 0; p.oy = 0; p.fit = 'cover';
    schedulePreview();
  });
  $('btnFillAll').addEventListener('click', () => {
    const photo = state.panels[state.selected].photo;
    state.panels.forEach((p) => { p.photo = photo; });
    schedulePreview();
  });

  $('titleText').addEventListener('input', (e) => { state.title = e.target.value; schedulePreview(); });
  $('taglineText').addEventListener('input', (e) => { state.tagline = e.target.value; schedulePreview(); });
  document.querySelectorAll('#titleSwatches .swatch').forEach((b) => {
    b.addEventListener('click', () => {
      state.titleColor = b.dataset.color;
      document.querySelectorAll('#titleSwatches .swatch').forEach((x) => x.classList.toggle('active', x === b));
      schedulePreview();
    });
  });
  $('titleOutline').addEventListener('change', (e) => { state.outline = e.target.checked; schedulePreview(); });
  $('titlePos').addEventListener('change', (e) => { state.titlePos = e.target.value; schedulePreview(); });

  $('btnExport').addEventListener('click', doExport);
  $('btnExportTop').addEventListener('click', doExport);

  // Canvas: click selects a panel, drag pans its photo, wheel zooms it.
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  preview.addEventListener('pointerdown', (e) => {
    const rect = preview.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    const polys = layoutPanels();
    for (let i = polys.length - 1; i >= 0; i--) {
      if (pointInPolygon(nx, ny, polys[i])) {
        state.selected = i;
        break;
      }
    }
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    preview.setPointerCapture(e.pointerId);
    schedulePreview();
  });
  preview.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const rect = preview.getBoundingClientRect();
    const panel = state.panels[state.selected];
    const b = panelBounds(layoutPanels()[state.selected]);
    panel.ox += ((e.clientX - lastX) / rect.width) / Math.max(0.05, b.w);
    panel.oy += ((e.clientY - lastY) / rect.height) / Math.max(0.05, b.h);
    panel.ox = Math.max(-1.5, Math.min(1.5, panel.ox));
    panel.oy = Math.max(-1.5, Math.min(1.5, panel.oy));
    lastX = e.clientX;
    lastY = e.clientY;
    schedulePreview();
  });
  const endDrag = () => { dragging = false; };
  preview.addEventListener('pointerup', endDrag);
  preview.addEventListener('pointercancel', endDrag);
  preview.addEventListener('wheel', (e) => {
    e.preventDefault();
    const panel = state.panels[state.selected];
    panel.zoom = Math.max(0.5, Math.min(3, panel.zoom * (e.deltaY < 0 ? 1.08 : 0.92)));
    schedulePreview();
  }, { passive: false });
}

// ---------------------------------------------------------------- shot mode

// ?shot=cover renders the cover full-frame (used for screenshots: the app's
// own drawing of the exported cover). ?shot=editor opens the editor with a
// sample photo loaded. Both accept ?photo=, ?caption=, ?layout=, ?grade=,
// ?size=, ?title= and ?tagline=.
async function applyShotParams() {
  const q = new URLSearchParams(window.location.search);
  const photo = q.get('photo');
  const caption = q.get('caption');
  const title = q.get('title');
  const tagline = q.get('tagline');
  const layout = q.get('layout');
  const grade = q.get('grade');
  const size = q.get('size');
  if (layout && LAYOUTS[layout]) state.layout = layout;
  if (grade && GRADES[grade]) state.grade = grade;
  if (size && EXPORT_SIZES[size]) state.size = size;
  if (title) state.title = title;
  else if (caption) state.title = caption;
  if (tagline) state.tagline = tagline;
  const shot = q.get('shot');
  if (!shot) return false;
  // Load both samples so multi-panel layouts have two photos to show.
  await loadSampleIntoSlot(photo && SAMPLES[photo] ? photo : 'pier', 0);
  await loadSampleIntoSlot(photo === 'boulevard' ? 'pier' : 'boulevard', 1);
  state.panels[0].photo = 0;
  if (state.panels[1]) state.panels[1].photo = 1;
  if (state.panels[2]) state.panels[2].photo = 0;
  if (state.panels[3]) state.panels[3].photo = 1;
  if (shot === 'cover') {
    document.body.classList.add('shot-cover');
    const canvas = $('shotCanvas');
    canvas.hidden = false;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    renderCover(ctx, canvas.width, canvas.height);
    document.title = `Cover — ${state.title}`;
    return true;
  }
  return false;
}

// ---------------------------------------------------------------- boot

bindEditor();
applyShotParams().then((isCover) => {
  if (!isCover) schedulePreview();
});
