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
const canvas    = document.getElementById('editor-canvas');
const ctx       = canvas.getContext('2d');
const sidebar   = document.getElementById('sidebar');
const btnAdd    = document.getElementById('btn-add');
const btnMove   = document.getElementById('btn-move');
const btnUndo   = document.getElementById('btn-undo');
const btnRedo   = document.getElementById('btn-redo');
const lblActive = document.getElementById('lbl-active');
const jsonOut   = document.getElementById('json-output');
const btnCopy   = document.getElementById('btn-copy');
const btnLoad   = document.getElementById('btn-load');

canvas.width  = LEFT + COLS * CELL;   // 590 px
canvas.height = TOP  + ROWS * CELL;   // 584 px

// ─── State ────────────────────────────────────────────────────────────────────
const state = {
  font:     null,
  active:   'a',
  tool:     'add',      // 'add' | 'move'
  selected: new Set(),  // point indices selected in the current glyph
  history:  [],         // array of deep-cloned glyphs snapshots
  histIdx:  -1,
  drag:     null,       // active interaction descriptor (see mouse handlers)
};

const previews = {};   // sidebar preview canvases keyed by letter

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

// ─── History ─────────────────────────────────────────────────────────────────

function cloneGlyphs(g) {
  return Object.fromEntries(
    Object.entries(g).map(([k, pts]) => [k, pts.map(p => [...p])])
  );
}

function pushHistory() {
  state.history = state.history.slice(0, state.histIdx + 1);
  state.history.push(cloneGlyphs(state.font.glyphs));
  state.histIdx++;
}

function restoreSnapshot(snapshot) {
  state.font.glyphs = cloneGlyphs(snapshot);
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

  // Grid — horizontal lines; highlight baseline border between y=0 and y=−1
  for (let r = 0; r <= ROWS; r++) {
    const y = TOP + r * CELL;
    const isBaseline = r === Y_MAX;        // row 16 = the y=0 grid line
    const isEdge = (r === 0 || r === ROWS);
    ctx.strokeStyle = isBaseline ? '#4a9eff' : isEdge ? '#c0c0c0' : '#e8e8e8';
    ctx.lineWidth   = isBaseline ? 2 : 1;
    ctx.setLineDash(isBaseline ? [6, 4] : []);
    ctx.beginPath(); ctx.moveTo(LEFT, y); ctx.lineTo(W, y); ctx.stroke();
    ctx.setLineDash([]);
  }

  // X-axis labels (column numbers along the top)
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#aaa';
  for (let c = 0; c < COLS; c++) {
    ctx.fillText(c, LEFT + c * CELL, TOP / 2);
  }

  // Y-axis labels (font y values along the left; y=0 highlighted blue)
  ctx.textAlign = 'right';
  for (let r = 0; r < ROWS; r++) {
    const fontY = Y_MAX - r;
    ctx.fillStyle = fontY === 0 ? '#4a9eff' : '#aaa';
    ctx.fillText(fontY, LEFT - 5, TOP + r * CELL);
  }

  // Path connecting all points in order
  const pts = state.font.glyphs[state.active];
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
    // Point index label
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
  pc2.fillStyle = '#0d0d0d';
  pc2.fillRect(0, 0, S, S);

  // Baseline in preview (proportional position)
  const baseY = ((Y_MAX + 1) / ROWS) * S;
  pc2.strokeStyle = '#1a3060';
  pc2.lineWidth = 1;
  pc2.beginPath(); pc2.moveTo(0, baseY); pc2.lineTo(S, baseY); pc2.stroke();

  const pts      = state.font?.glyphs[letter] ?? [];
  const isActive = letter === state.active;

  if (pts.length === 0) {
    // Show the letter character as placeholder
    pc2.fillStyle = '#444';
    pc2.font = `bold ${Math.round(S * 0.38)}px monospace`;
    pc2.textAlign = 'center';
    pc2.textBaseline = 'middle';
    pc2.fillText(letter, S / 2, S / 2);
    return;
  }

  // Map font coords → preview pixels
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
    pc2.strokeStyle = isActive ? '#4a9eff' : '#888';
    pc2.lineWidth = 1.5;
    pc2.lineJoin = 'round';
    pc2.stroke();
  }

  for (const [fx, fy] of pts) {
    const [px, py] = fp(fx, fy);
    pc2.fillStyle = isActive ? '#4a9eff' : '#666';
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
}

function renderAll() {
  renderCanvas();
  renderSidebar();
  updateJSON();
  syncButtons();
}

// ─── JSON formatter ───────────────────────────────────────────────────────────
// Keeps each glyph's point array on one line to match the original file format.
function formatFont(font) {
  const lines = Object.entries(font.glyphs)
    .map(([k, pts]) =>
      `    ${JSON.stringify(k)}: [${pts.map(([x, y]) => `[${x},${y}]`).join(',')}]`
    );
  return `{\n  "name": ${JSON.stringify(font.name)},\n  "glyphs": {\n${lines.join(',\n')}\n  }\n}`;
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

  // ── Add tool: append a point ──
  if (state.tool === 'add') {
    const [fx, fy] = canvasToFont(cx, cy);
    if (!pts.some(([px, py]) => px === fx && py === fy)) {
      pushHistory();
      pts.push([fx, fy]);
      renderAll();
    }
    return;
  }

  // ── Move / Select tool ──
  const hi = hitTest(cx, cy, pts);

  if (hi >= 0) {
    // Clicked on a point
    if (e.shiftKey) {
      // Shift-click: toggle this point in the selection
      state.selected.has(hi) ? state.selected.delete(hi) : state.selected.add(hi);
      renderCanvas();
    } else {
      // Regular click: if not already selected, replace selection
      if (!state.selected.has(hi)) {
        state.selected.clear();
        state.selected.add(hi);
        renderCanvas();
      }
      // Begin drag for all currently selected points
      const [sfx, sfy] = canvasToFont(cx, cy);
      state.drag = {
        type:     'move',
        sfx, sfy,                        // drag start in font coords
        startPos: pts.map(p => [...p]),  // snapshot of all positions
        dfx: 0, dfy: 0,
        moved: false,
      };
    }
  } else {
    // Clicked on empty space → start rubber-band
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
      // Live-update positions for all selected points
      for (const i of state.selected) {
        const [sx, sy] = state.drag.startPos[i];
        pts[i] = [
          Math.max(0,     Math.min(COLS - 1, sx + dfx)),
          Math.max(Y_MIN, Math.min(Y_MAX,    sy + dfy)),
        ];
      }
      renderCanvas();
      renderPreview(state.active);
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
    // Add all points within the rectangle to the selection
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
    // Commit: save a history entry with the BEFORE state, then apply final state.
    // We temporarily restore start positions so pushHistory() snapshots them,
    // then immediately re-apply the moved positions.
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

  // Undo / Redo — always active regardless of focus
  if (isMeta && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
  if (isMeta && (e.key === 'Z' || e.key === 'y')) { e.preventDefault(); redo(); return; }

  // Don't intercept other keys when typing in the textarea
  if (document.activeElement === jsonOut) return;

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
    // Remove selected indices in descending order to keep lower indices valid
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
    state.font = { name: parsed.name ?? state.font.name, glyphs: parsed.glyphs };
    for (const l of LETTERS) {
      if (!Array.isArray(state.font.glyphs[l])) state.font.glyphs[l] = [];
    }
    state.selected.clear();
    renderAll();
  } catch (err) {
    alert('Invalid JSON: ' + err.message);
  }
});

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
    const res   = await fetch('fonts/nee.json');
    state.font  = await res.json();
  } catch {
    state.font = { name: 'nee', glyphs: {} };
  }

  // Ensure all 26 lowercase letters exist (empty array if not defined)
  for (const l of LETTERS) {
    if (!Array.isArray(state.font.glyphs[l])) state.font.glyphs[l] = [];
  }

  buildSidebar();
  pushHistory();   // snapshot the initial (loaded) state
  renderAll();
}

init();
