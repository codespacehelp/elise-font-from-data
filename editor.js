// ─── Constants ────────────────────────────────────────────────────────────────
const CELL         = 28;           // canvas pixels per font grid cell
const COLS         = 20;           // grid columns  (font x: 0 .. 19)
const ROWS         = 20;           // grid rows
const Y_MAX        = 16;           // font y at the top row (row 0)
const Y_MIN        = Y_MAX - ROWS + 1;  // = −3, font y at bottom row (row 19)
const LEFT         = 30;           // left margin for y-axis labels
const TOP          = 24;           // top margin  for x-axis labels
const PREVIEW_SIZE = 40;           // sidebar preview canvas size (px)
const HIT_RADIUS   = CELL * 0.48;  // px — point hit-test radius
const LETTERS      = 'abcdefghijklmnopqrstuvwxyz'.split('');

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const canvas        = document.getElementById('editor-canvas');
const ctx           = canvas.getContext('2d');
const sidebar       = document.getElementById('sidebar');
const btnAdd        = document.getElementById('btn-add');
const btnMove       = document.getElementById('btn-move');
const btnUndo       = document.getElementById('btn-undo');
const btnRedo       = document.getElementById('btn-redo');
const lblActive     = document.getElementById('lbl-active');
const jsonOut       = document.getElementById('json-output');
const btnCopy       = document.getElementById('btn-copy');
const btnLoad       = document.getElementById('btn-load');
const btnSave       = document.getElementById('btn-save');
const inpLsb        = document.getElementById('inp-lsb');
const inpRsb        = document.getElementById('inp-rsb');
const inpXHeight    = document.getElementById('inp-xheight');
const previewInput  = document.getElementById('preview-input');
const previewCanvas = document.getElementById('preview-canvas');

canvas.width  = LEFT + COLS * CELL;   // 590 px
canvas.height = TOP  + ROWS * CELL;   // 584 px

// ─── State ────────────────────────────────────────────────────────────────────
const state = {
  font:     null,
  active:   'a',
  tool:     'add',      // 'add' | 'move'
  selected: new Set(),  // point indices selected in the current glyph
  history:  [],         // array of snapshots
  histIdx:  -1,
  drag:     null,
};

const previews = {};   // sidebar preview canvases keyed by letter

// ─── Font metric helpers ──────────────────────────────────────────────────────

/** Max x-coordinate of a glyph's points (0 if empty). */
function glyphMaxX(letter) {
  const pts = state.font?.glyphs[letter] ?? [];
  return pts.length ? Math.max(...pts.map(p => p[0])) : 0;
}

/** Total advance = lsb + glyph_body + rsb. */
function calcAdvance(letter) {
  const lsb = state.font?.lsb[letter] ?? 0;
  const rsb = state.font?.rsb[letter] ?? 2;
  return lsb + glyphMaxX(letter) + rsb;
}

// ─── Coordinate helpers ───────────────────────────────────────────────────────

/** Font [fx, fy] → canvas [cx, cy] (at the grid line intersection) */
function fontToCanvas(fx, fy) {
  return [
    LEFT + fx * CELL,
    TOP  + (Y_MAX - fy) * CELL,
  ];
}

/** Canvas click [cx, cy] → nearest font integer [fx, fy] */
function canvasToFont(cx, cy) {
  const col = Math.round((cx - LEFT) / CELL);
  const row = Math.round((cy - TOP)  / CELL);
  return [
    Math.max(0,     Math.min(COLS - 1, col)),
    Math.max(Y_MIN, Math.min(Y_MAX,    Y_MAX - row)),
  ];
}

/** Returns index of the topmost point within HIT_RADIUS of (cx, cy), or -1 */
function hitTest(cx, cy, pts) {
  for (let i = pts.length - 1; i >= 0; i--) {
    const [px, py] = fontToCanvas(pts[i][0], pts[i][1]);
    if ((cx - px) ** 2 + (cy - py) ** 2 < HIT_RADIUS ** 2) return i;
  }
  return -1;
}

// ─── History ──────────────────────────────────────────────────────────────────

function cloneGlyphs(g) {
  return Object.fromEntries(
    Object.entries(g).map(([k, pts]) => [k, pts.map(p => [...p])])
  );
}

function cloneSnapshot(font) {
  return {
    glyphs:   cloneGlyphs(font.glyphs),
    lsb:      { ...font.lsb },
    rsb:      { ...font.rsb },
    xHeight:  font.xHeight,
  };
}

function pushHistory() {
  state.history = state.history.slice(0, state.histIdx + 1);
  state.history.push(cloneSnapshot(state.font));
  state.histIdx++;
}

function restoreSnapshot(snapshot) {
  state.font.glyphs  = cloneGlyphs(snapshot.glyphs);
  state.font.lsb     = { ...snapshot.lsb };
  state.font.rsb     = { ...snapshot.rsb };
  state.font.xHeight = snapshot.xHeight;
  state.selected.clear();
  state.drag = null;
  renderAll();
}

function undo() {
  if (state.histIdx > 0) restoreSnapshot(state.history[--state.histIdx]);
}

function redo() {
  if (state.histIdx < state.history.length - 1)
    restoreSnapshot(state.history[++state.histIdx]);
}

// ─── Rendering ────────────────────────────────────────────────────────────────

function renderCanvas() {
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  // White background
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);

  // Grid — vertical lines
  for (let c = 0; c <= COLS; c++) {
    const x = LEFT + c * CELL;
    ctx.strokeStyle = (c === 0 || c === COLS) ? '#c0c0c0' : '#e8e8e8';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(x, TOP); ctx.lineTo(x, H); ctx.stroke();
  }

  // Grid — horizontal lines; highlight baseline
  for (let r = 0; r <= ROWS; r++) {
    const y = TOP + r * CELL;
    const isBaseline = r === Y_MAX;
    const isEdge = (r === 0 || r === ROWS);
    ctx.strokeStyle = isBaseline ? '#999' : isEdge ? '#c0c0c0' : '#e8e8e8';
    ctx.lineWidth   = isBaseline ? 1.5 : 1;
    ctx.setLineDash(isBaseline ? [6, 4] : []);
    ctx.beginPath(); ctx.moveTo(LEFT, y); ctx.lineTo(W, y); ctx.stroke();
    ctx.setLineDash([]);
  }

  // X-axis labels
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#aaa';
  for (let c = 0; c < COLS; c++) {
    ctx.fillText(c, LEFT + c * CELL, TOP / 2);
  }

  // Y-axis labels
  ctx.textAlign = 'right';
  for (let r = 0; r < ROWS; r++) {
    const fontY = Y_MAX - r;
    ctx.fillStyle = '#aaa';
    ctx.fillText(fontY, LEFT - 5, TOP + r * CELL);
  }

  if (state.font) {
    // ── x-height guide line (dashed horizontal) ──
    const xh = state.font.xHeight ?? 9;
    const [, xhY] = fontToCanvas(0, xh);
    ctx.save();
    ctx.strokeStyle = '#aaa';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(LEFT, xhY);
    ctx.lineTo(W, xhY);
    ctx.stroke();
    ctx.fillStyle = '#aaa';
    ctx.font = '9px monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`x-h ${xh}`, LEFT - 2, xhY - 1);
    ctx.restore();

    // ── Left side bearing guide (dashed vertical) ──
    const lsb = state.font.lsb[state.active] ?? 0;
    if (lsb > 0) {
      const [lsbX] = fontToCanvas(lsb, 0);
      ctx.save();
      ctx.strokeStyle = '#aaa';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(lsbX, TOP);
      ctx.lineTo(lsbX, H);
      ctx.stroke();
      ctx.fillStyle = '#aaa';
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('lsb', lsbX, TOP + 2);
      ctx.restore();
    }

    // ── Right bearing / advance guide (dashed vertical) ──
    const adv = calcAdvance(state.active);
    const [advX] = fontToCanvas(adv, 0);
    ctx.save();
    ctx.strokeStyle = '#aaa';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(advX, TOP);
    ctx.lineTo(advX, H);
    ctx.stroke();
    ctx.fillStyle = '#aaa';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('rsb', advX, TOP + 2);
    ctx.restore();
  }

  // Path connecting all points in order
  const pts = state.font?.glyphs[state.active] ?? [];
  if (pts.length > 1) {
    ctx.beginPath();
    const [x0, y0] = fontToCanvas(pts[0][0], pts[0][1]);
    ctx.moveTo(x0, y0);
    for (let i = 1; i < pts.length; i++) {
      const [xi, yi] = fontToCanvas(pts[i][0], pts[i][1]);
      ctx.lineTo(xi, yi);
    }
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.setLineDash([]);
    ctx.stroke();
  }

  // Points as circles; selected = blue & larger
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  for (let i = 0; i < pts.length; i++) {
    const [cx, cy] = fontToCanvas(pts[i][0], pts[i][1]);
    const sel = state.selected.has(i);
    ctx.fillStyle = sel ? '#4a9eff' : '#222';
    ctx.beginPath();
    ctx.arc(cx, cy, sel ? 7 : 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#999';
    ctx.font = '9px monospace';
    ctx.fillText(i, cx + 7, cy - 2);
  }

  // Rubber-band selection rectangle
  if (state.drag?.type === 'rubber-band') {
    const { ax, ay, bx, by } = state.drag;
    const rx = Math.min(ax, bx), ry = Math.min(ay, by);
    const rw = Math.abs(bx - ax), rh = Math.abs(by - ay);
    ctx.fillStyle = 'rgba(74,158,255,0.10)';
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeStyle = '#4a9eff';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.setLineDash([]);
  }
}

function renderPreview(letter) {
  const pc  = previews[letter];
  const pc2 = pc.getContext('2d');
  const S   = PREVIEW_SIZE;
  pc2.clearRect(0, 0, S, S);
  pc2.fillStyle = '#fff';
  pc2.fillRect(0, 0, S, S);

  const baseY = ((Y_MAX + 1) / ROWS) * S;
  pc2.strokeStyle = '#ddd';
  pc2.lineWidth = 1;
  pc2.beginPath(); pc2.moveTo(0, baseY); pc2.lineTo(S, baseY); pc2.stroke();

  const pts      = state.font?.glyphs[letter] ?? [];
  const isActive = letter === state.active;

  if (pts.length === 0) {
    pc2.fillStyle = '#ccc';
    pc2.font = `bold ${Math.round(S * 0.38)}px monospace`;
    pc2.textAlign = 'center';
    pc2.textBaseline = 'middle';
    pc2.fillText(letter, S / 2, S / 2);
    return;
  }

  function fp(fx, fy) {
    return [(fx / COLS) * S, ((Y_MAX - fy) / ROWS) * S];
  }

  if (pts.length > 1) {
    pc2.beginPath();
    const [px0, py0] = fp(pts[0][0], pts[0][1]);
    pc2.moveTo(px0, py0);
    for (let i = 1; i < pts.length; i++) {
      const [pxi, pyi] = fp(pts[i][0], pts[i][1]);
      pc2.lineTo(pxi, pyi);
    }
    pc2.strokeStyle = isActive ? '#111' : '#bbb';
    pc2.lineWidth = 1.5;
    pc2.lineJoin = 'round';
    pc2.stroke();
  }

  for (const [fx, fy] of pts) {
    const [px, py] = fp(fx, fy);
    pc2.fillStyle = isActive ? '#111' : '#ccc';
    pc2.beginPath(); pc2.arc(px, py, 1.5, 0, Math.PI * 2); pc2.fill();
  }
}

function renderSidebar() {
  for (const l of LETTERS) {
    const item = document.getElementById(`gi-${l}`);
    if (item) item.classList.toggle('active', l === state.active);
    renderPreview(l);
  }
}

function updateJSON() {
  jsonOut.value = formatFont(state.font);
}

function syncButtons() {
  btnUndo.disabled = state.histIdx <= 0;
  btnRedo.disabled = state.histIdx >= state.history.length - 1;
  btnAdd.classList.toggle('active',  state.tool === 'add');
  btnMove.classList.toggle('active', state.tool === 'move');
  lblActive.textContent = `Editing: ${state.active}`;
  if (state.font) {
    inpLsb.value     = state.font.lsb[state.active] ?? 0;
    inpRsb.value     = state.font.rsb[state.active] ?? 2;
    inpXHeight.value  = state.font.xHeight ?? 9;
  }
}

function renderAll() {
  renderCanvas();
  renderSidebar();
  updateJSON();
  syncButtons();
  renderPreviewPanel();
  // Studio: notify outline panel that font data changed
  window.dispatchEvent(new CustomEvent('fontChanged'));
}

// ─── Live preview panel ───────────────────────────────────────────────────────
function renderPreviewPanel() {
  if (!state.font) return;
  const pc   = previewCanvas;
  const pctx = pc.getContext('2d');
  const W    = pc.width;
  const H    = pc.height;

  pctx.fillStyle = '#fff';
  pctx.fillRect(0, 0, W, H);

  const text = previewInput.value.toLowerCase();
  if (!text) return;

  const SPACE_ADV = 7;
  const LETTER_H  = 19; // Y_MAX (16) + descender (3)

  let totalW = 0;
  for (const ch of text) {
    totalW += LETTERS.includes(ch) ? calcAdvance(ch) : SPACE_ADV;
  }

  const MARGIN     = 16;
  const SCALE      = Math.min(
    (W - 2 * MARGIN) / Math.max(totalW, 1),
    (H - 2 * MARGIN) / LETTER_H
  );
  const BASELINE_Y = MARGIN + Y_MAX * SCALE;

  // x-height guide in preview
  const xh = state.font.xHeight ?? 9;
  pctx.strokeStyle = 'rgba(0,0,0,0.12)';
  pctx.lineWidth = 1;
  pctx.setLineDash([4, 3]);
  pctx.beginPath();
  pctx.moveTo(0, BASELINE_Y - xh * SCALE);
  pctx.lineTo(W, BASELINE_Y - xh * SCALE);
  pctx.stroke();
  pctx.setLineDash([]);

  // baseline guide in preview
  pctx.strokeStyle = 'rgba(0,0,0,0.12)';
  pctx.lineWidth = 1;
  pctx.beginPath();
  pctx.moveTo(0, BASELINE_Y);
  pctx.lineTo(W, BASELINE_Y);
  pctx.stroke();

  pctx.strokeStyle = '#222';
  pctx.lineWidth   = Math.max(1, SCALE * 0.18);
  pctx.lineCap     = 'round';
  pctx.lineJoin    = 'round';

  let x = MARGIN;
  for (const ch of text) {
    if (!LETTERS.includes(ch)) { x += SPACE_ADV * SCALE; continue; }
    const pts = state.font.glyphs[ch];
    const lsb = state.font.lsb[ch] ?? 0;
    const adv = calcAdvance(ch);

    if (pts.length >= 2) {
      pctx.beginPath();
      const [x0, y0] = pts[0];
      pctx.moveTo(x + (lsb + x0) * SCALE, BASELINE_Y - y0 * SCALE);
      for (let i = 1; i < pts.length; i++) {
        const [xi, yi] = pts[i];
        pctx.lineTo(x + (lsb + xi) * SCALE, BASELINE_Y - yi * SCALE);
      }
      pctx.stroke();
    }
    x += adv * SCALE;
  }
}

// ─── JSON formatter ───────────────────────────────────────────────────────────
// lsb/rsb worden per glyph opgeslagen, niet als losse blokken onderaan.
function formatFont(font) {
  const glyphLines = LETTERS.map(l => {
    const pts = font.glyphs[l] ?? [];
    const lsb = font.lsb[l] ?? 0;
    const rsb = font.rsb[l] ?? 2;
    const ptsStr = pts.map(([x, y]) => `[${x},${y}]`).join(',');
    return `    ${JSON.stringify(l)}: {"lsb":${lsb},"rsb":${rsb},"points":[${ptsStr}]}`;
  });
  return [
    '{',
    `  "name": ${JSON.stringify(font.name)},`,
    `  "xHeight": ${font.xHeight ?? 9},`,
    `  "glyphs": {\n${glyphLines.join(',\n')}\n  }`,
    '}',
  ].join('\n');
}

// ─── Save (File System Access API) ───────────────────────────────────────────
let fileHandle = null;

async function saveFont() {
  const json = formatFont(state.font);
  try {
    if (!fileHandle) {
      fileHandle = await window.showSaveFilePicker({
        suggestedName: (state.font.name ?? 'font') + '.json',
        types: [{ description: 'JSON font', accept: { 'application/json': ['.json'] } }],
      });
    }
    const writable = await fileHandle.createWritable();
    await writable.write(json);
    await writable.close();
    if (btnSave) { btnSave.textContent = '✓ Saved'; setTimeout(() => (btnSave.textContent = '💾 Save'), 1500); }
  } catch (err) {
    if (err.name === 'AbortError') return; // gebruiker annuleerde picker
    // Fallback: download het bestand
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (state.font.name ?? 'font') + '.json';
    a.click();
  }
}

// ─── Init helpers ─────────────────────────────────────────────────────────────

/** Normaliseer het font na laden: ondersteunt zowel nieuw (per-glyph) als oud formaat. */
function ensureMetrics(font) {
  // Bewaar top-level lsb/rsb voor migratie van tussenstap-formaat
  const topLsb = font.lsb;
  const topRsb = font.rsb;
  font.lsb = {};
  font.rsb = {};

  for (const l of LETTERS) {
    const raw = font.glyphs[l];

    if (raw && !Array.isArray(raw)) {
      // Nieuw formaat: { lsb, rsb, points }
      font.glyphs[l] = Array.isArray(raw.points) ? raw.points : [];
      font.lsb[l]    = typeof raw.lsb === 'number' ? raw.lsb : 0;
      font.rsb[l]    = typeof raw.rsb === 'number' ? raw.rsb : 2;
    } else {
      // Oud formaat: glyph is een array (of null/undefined)
      font.glyphs[l] = Array.isArray(raw) ? raw : [];
      const pts  = font.glyphs[l];
      const maxX = pts.length ? Math.max(...pts.map(p => p[0])) : 0;

      // Prioriteit: top-level lsb/rsb (tussenstap) → old advances → standaard
      font.lsb[l] = typeof topLsb?.[l] === 'number' ? topLsb[l] : 0;

      if (typeof topRsb?.[l] === 'number') {
        font.rsb[l] = topRsb[l];
      } else if (typeof font.advances?.[l] === 'number') {
        font.rsb[l] = Math.max(0, font.advances[l] - maxX);
      } else {
        font.rsb[l] = 2;
      }
    }
  }

  if (typeof font.xHeight !== 'number') font.xHeight = 9;
  delete font.advances;
}

// ─── Tool switching ───────────────────────────────────────────────────────────
function setTool(t) {
  state.tool = t;
  state.selected.clear();
  state.drag = null;
  canvas.style.cursor = t === 'add' ? 'crosshair' : 'default';
  renderCanvas();
  syncButtons();
}

// ─── Mouse events ─────────────────────────────────────────────────────────────
canvas.addEventListener('mousedown',  onMouseDown);
canvas.addEventListener('mousemove',  onMouseMove);
canvas.addEventListener('mouseup',    onMouseUp);
canvas.addEventListener('mouseleave', onMouseUp);

function onMouseDown(e) {
  const cx  = e.offsetX, cy = e.offsetY;
  const pts = state.font.glyphs[state.active];

  if (state.tool === 'add') {
    const [fx, fy] = canvasToFont(cx, cy);
    if (!pts.some(([px, py]) => px === fx && py === fy)) {
      pushHistory();
      pts.push([fx, fy]);
      renderAll();
    }
    return;
  }

  const hi = hitTest(cx, cy, pts);

  if (hi >= 0) {
    if (e.shiftKey) {
      state.selected.has(hi) ? state.selected.delete(hi) : state.selected.add(hi);
      renderCanvas();
    } else {
      if (!state.selected.has(hi)) {
        state.selected.clear();
        state.selected.add(hi);
        renderCanvas();
      }
      const [sfx, sfy] = canvasToFont(cx, cy);
      state.drag = {
        type:     'move',
        sfx, sfy,
        startPos: pts.map(p => [...p]),
        dfx: 0, dfy: 0,
        moved: false,
      };
    }
  } else {
    if (!e.shiftKey) state.selected.clear();
    state.drag = { type: 'rubber-band', ax: cx, ay: cy, bx: cx, by: cy };
    renderCanvas();
  }
}

function onMouseMove(e) {
  if (!state.drag) return;
  const cx  = e.offsetX, cy = e.offsetY;
  const pts = state.font.glyphs[state.active];

  if (state.drag.type === 'rubber-band') {
    state.drag.bx = cx;
    state.drag.by = cy;
    renderCanvas();
    return;
  }

  if (state.drag.type === 'move') {
    const [cfx, cfy] = canvasToFont(cx, cy);
    const dfx = cfx - state.drag.sfx;
    const dfy = cfy - state.drag.sfy;
    if (dfx !== state.drag.dfx || dfy !== state.drag.dfy) {
      state.drag.dfx   = dfx;
      state.drag.dfy   = dfy;
      state.drag.moved = true;
      for (const i of state.selected) {
        const [sx, sy] = state.drag.startPos[i];
        pts[i] = [
          Math.max(0,     Math.min(COLS - 1, sx + dfx)),
          Math.max(Y_MIN, Math.min(Y_MAX,    sy + dfy)),
        ];
      }
      renderCanvas();
      renderPreview(state.active);
      renderPreviewPanel();
      updateJSON();
    }
  }
}

function onMouseUp(e) {
  if (!state.drag) return;
  const pts  = state.font.glyphs[state.active];
  const drag = state.drag;
  state.drag = null;

  if (drag.type === 'rubber-band') {
    const rx0 = Math.min(drag.ax, drag.bx), rx1 = Math.max(drag.ax, drag.bx);
    const ry0 = Math.min(drag.ay, drag.by), ry1 = Math.max(drag.ay, drag.by);
    for (let i = 0; i < pts.length; i++) {
      const [pcx, pcy] = fontToCanvas(pts[i][0], pts[i][1]);
      if (pcx >= rx0 && pcx <= rx1 && pcy >= ry0 && pcy <= ry1) {
        state.selected.add(i);
      }
    }
    renderCanvas();
    syncButtons();
    return;
  }

  if (drag.type === 'move' && drag.moved) {
    const movedPos = pts.map(p => [...p]);
    for (let i = 0; i < pts.length; i++) pts[i] = drag.startPos[i];
    pushHistory();
    for (let i = 0; i < pts.length; i++) pts[i] = movedPos[i];
    renderAll();
  }
}

// ─── Keyboard ─────────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  const isMeta = e.metaKey || e.ctrlKey;

  if (isMeta && e.key === 's') { e.preventDefault(); saveFont(); return; }
  if (isMeta && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
  if (isMeta && (e.key === 'Z' || e.key === 'y')) { e.preventDefault(); redo(); return; }

  const active = document.activeElement;
  if (active === jsonOut || active === previewInput ||
      active === inpLsb  || active === inpRsb || active === inpXHeight) return;

  if (e.key === 'p' || e.key === 'P') { setTool('add');  return; }
  if (e.key === 'v' || e.key === 'V') { setTool('move'); return; }

  if (e.key === 'Escape') {
    state.selected.clear();
    state.drag = null;
    renderCanvas();
    return;
  }

  if ((e.key === 'Backspace' || e.key === 'Delete') &&
      state.tool === 'move' && state.selected.size > 0) {
    e.preventDefault();
    pushHistory();
    const pts = state.font.glyphs[state.active];
    for (const i of [...state.selected].sort((a, b) => b - a)) {
      pts.splice(i, 1);
    }
    state.selected.clear();
    renderAll();
  }
});

// ─── Toolbar buttons ──────────────────────────────────────────────────────────
btnAdd.addEventListener('click',  () => setTool('add'));
btnMove.addEventListener('click', () => setTool('move'));
btnUndo.addEventListener('click', undo);
btnRedo.addEventListener('click', redo);
btnSave?.addEventListener('click', saveFont);

btnCopy.addEventListener('click', () => {
  navigator.clipboard.writeText(jsonOut.value).then(() => {
    const orig = btnCopy.textContent;
    btnCopy.textContent = 'Copied!';
    setTimeout(() => (btnCopy.textContent = orig), 1500);
  });
});

btnLoad.addEventListener('click', () => {
  try {
    const parsed = JSON.parse(jsonOut.value);
    if (typeof parsed !== 'object' || !parsed.glyphs)
      throw new Error('Missing "glyphs" key');
    pushHistory();
    state.font = {
      name:    parsed.name ?? state.font.name,
      glyphs:  parsed.glyphs,
      lsb:     parsed.lsb    ?? {},
      rsb:     parsed.rsb    ?? {},
      xHeight: parsed.xHeight ?? 9,
      advances: parsed.advances,  // keep temporarily for migration
    };
    ensureMetrics(state.font);
    state.selected.clear();
    renderAll();
  } catch (err) {
    alert('Invalid JSON: ' + err.message);
  }
});

// ─── Metric inputs ────────────────────────────────────────────────────────────
inpLsb.addEventListener('input', () => {
  const v = parseInt(inpLsb.value, 10);
  if (!isNaN(v) && state.font) {
    pushHistory();
    state.font.lsb[state.active] = v;
    renderCanvas();
    updateJSON();
    renderPreviewPanel();
  }
});

inpRsb.addEventListener('input', () => {
  const v = parseInt(inpRsb.value, 10);
  if (!isNaN(v) && v >= 0 && state.font) {
    pushHistory();
    state.font.rsb[state.active] = v;
    renderCanvas();
    updateJSON();
    renderPreviewPanel();
  }
});

inpXHeight.addEventListener('input', () => {
  const v = parseInt(inpXHeight.value, 10);
  if (!isNaN(v) && v >= 1 && v <= 16 && state.font) {
    pushHistory();
    state.font.xHeight = v;
    renderCanvas();
    updateJSON();
    renderPreviewPanel();
  }
});

previewInput.addEventListener('input', renderPreviewPanel);

// ─── Sidebar builder ──────────────────────────────────────────────────────────
function buildSidebar() {
  sidebar.innerHTML = '';
  for (const l of LETTERS) {
    const item = document.createElement('div');
    item.id        = `gi-${l}`;
    item.className = 'glyph-item' + (l === state.active ? ' active' : '');

    const pc    = document.createElement('canvas');
    pc.width    = PREVIEW_SIZE;
    pc.height   = PREVIEW_SIZE;
    previews[l] = pc;

    const lbl       = document.createElement('div');
    lbl.className   = 'glyph-label';
    lbl.textContent = l;

    item.append(pc, lbl);
    item.addEventListener('click', () => {
      state.active = l;
      state.selected.clear();
      state.drag = null;
      renderAll();
    });
    sidebar.appendChild(item);
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  try {
    const res  = await fetch('fonts/nee.json');
    state.font = await res.json();
  } catch {
    state.font = { name: 'nee', glyphs: {} };
  }

  ensureMetrics(state.font);

  // Studio: expose font reference so outline panel can read it
  window._studioFont = state.font;

  // Resize preview canvas to fill its container
  const resizePreview = () => {
    const panel = previewCanvas.parentElement;
    previewCanvas.width  = panel.clientWidth;
    previewCanvas.height = panel.clientHeight - previewCanvas.offsetTop;
    renderPreviewPanel();
  };
  new ResizeObserver(resizePreview).observe(previewCanvas.parentElement);

  buildSidebar();
  pushHistory();
  renderAll();
}

init();
