// ─── Canvas setup ─────────────────────────────────────────────────────────────
const canvas = document.createElement("canvas");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
document.body.appendChild(canvas);
const ctx = canvas.getContext("2d");

let SCALE = 20;
let MARGIN = 40;
let BASELINE_Y = canvas.height / 2;
let frameCount = 0;

window.addEventListener("resize", () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  BASELINE_Y = canvas.height / 2;
});

function toCanvas(inst, gx, gy) {
  return [
    inst.gridX * SCALE + gx * SCALE + MARGIN,
    BASELINE_Y - inst.gridY * SCALE - gy * SCALE,
  ];
}

// ─── Sampling helper ──────────────────────────────────────────────────────────
function sampleAlongStroke(pts, spacing) {
  const samples = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.floor(len / spacing));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      samples.push([x0 + dx * t, y0 + dy * t]);
    }
  }
  if (pts.length > 0) samples.push(pts[pts.length - 1]);
  return samples;
}

// ─── Instance creation ────────────────────────────────────────────────────────
// For each sample point we generate:
//   hBars — horizontal bars (extend left/right to letter edges)
//   vBars — vertical bars   (extend up/down to letter edges)
// The ghost stroke is drawn on top so the letter form stays readable.
function createInstance(letter, gridX, gridY, pts) {
  const xs = pts.map(p => p[0]);
  const ys = pts.map(p => p[1]);
  const bbox = {
    minX: Math.min(...xs), maxX: Math.max(...xs),
    minY: Math.min(...ys), maxY: Math.max(...ys),
  };

  const samples = sampleAlongStroke(pts, 0.75);

  const particles = samples.map(([x, y]) => {
    // How far this point sits from each edge of the letter
    const toLeft   = x - bbox.minX;
    const toRight  = bbox.maxX - x;
    const toBottom = y - bbox.minY;   // in grid coords, y increases upward
    const toTop    = bbox.maxY - y;

    // Horizontal bars: most span full letter width, some are shorter
    const nH = 2 + Math.floor(Math.random() * 4);
    const hBars = Array.from({ length: nH }, () => {
      const full = Math.random() < 0.6;
      return {
        dy:    (Math.random() - 0.5) * 0.9,
        left:  full ? toLeft  + 0.3 : toLeft  * (0.2 + Math.random() * 0.8),
        right: full ? toRight + 0.3 : toRight * (0.2 + Math.random() * 0.8),
        h:     0.05 + Math.random() * 0.24,
        alpha: 0.55 + Math.random() * 0.42,
      };
    });

    // Vertical bars: same logic in the y direction
    const nV = 1 + Math.floor(Math.random() * 3);
    const vBars = Array.from({ length: nV }, () => {
      const full = Math.random() < 0.55;
      return {
        dx:     (Math.random() - 0.5) * 0.9,
        below:  full ? toBottom + 0.3 : toBottom * (0.2 + Math.random() * 0.8),
        above:  full ? toTop    + 0.3 : toTop    * (0.2 + Math.random() * 0.8),
        w:      0.05 + Math.random() * 0.22,
        alpha:  0.30 + Math.random() * 0.32,  // slightly softer than horizontal
      };
    });

    return {
      x, y,
      hBars, vBars,
      phase:     Math.random() * Math.PI * 2,
      shiftRate: 0.006 + Math.random() * 0.014,
    };
  });

  return { letter, gridX, gridY, origPts: pts, particles };
}

// ─── Draw ─────────────────────────────────────────────────────────────────────
function drawStrokeOf(inst, lineWidth, color) {
  ctx.beginPath();
  let first = true;
  for (const [px, py] of inst.origPts) {
    const [cx, cy] = toCanvas(inst, px, py);
    first ? ctx.moveTo(cx, cy) : ctx.lineTo(cx, cy);
    first = false;
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function drawInstance(inst) {
  // ── Glitch bars (drawn first, letter stroke will cut through on top) ──
  for (const p of inst.particles) {
    const [cx, cy] = toCanvas(inst, p.x, p.y);
    const hShift = Math.sin(frameCount * p.shiftRate + p.phase) * SCALE * 0.22;
    const vShift = Math.cos(frameCount * p.shiftRate * 0.7 + p.phase) * SCALE * 0.18;

    // Horizontal bars
    for (const bar of p.hBars) {
      const bx = cx - bar.left  * SCALE + hShift;
      const by = cy - bar.dy    * SCALE - (bar.h * SCALE) / 2;
      const bw = (bar.left + bar.right) * SCALE;
      const bh = Math.max(1, bar.h * SCALE);
      ctx.fillStyle = `rgba(10, 7, 3, ${bar.alpha})`;
      ctx.fillRect(bx, by, bw, bh);
    }

    // Vertical bars
    for (const bar of p.vBars) {
      const bx = cx + bar.dx    * SCALE - (bar.w * SCALE) / 2;
      const by = cy - bar.above * SCALE + vShift;
      const bw = Math.max(1, bar.w * SCALE);
      const bh = (bar.above + bar.below) * SCALE;
      ctx.fillStyle = `rgba(10, 7, 3, ${bar.alpha})`;
      ctx.fillRect(bx, by, bw, bh);
    }
  }

  // ── Letter stroke drawn ON TOP — cuts through the glitch, stays readable ──
  // Wide cream halo erases bars along the stroke path
  drawStrokeOf(inst, Math.max(5, SCALE * 1.0), 'rgba(245, 242, 236, 0.92)');
  // Crisp dark line on top
  drawStrokeOf(inst, Math.max(1.2, SCALE * 0.28), 'rgba(18, 12, 4, 0.80)');
}

// ─── Animation loop ───────────────────────────────────────────────────────────
function animate(instances) {
  frameCount++;

  ctx.fillStyle = '#f5f2ec';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (const inst of instances) drawInstance(inst);

  requestAnimationFrame(() => animate(instances));
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────
async function main() {
  ctx.fillStyle = '#f5f2ec';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const res = await fetch("../fonts/outline-nee-s0.17-r30.json");
  const data = await res.json();

  const PER_ROW = 5, ROW_STEP = 20, LETTER_HEIGHT_UP = 16, LETTER_HEIGHT_DOWN = 3;

  const lsb = {}, rsb = {};
  for (const [l, g] of Object.entries(data.glyphs)) {
    if (g && !Array.isArray(g)) {
      lsb[l] = g.lsb ?? 0; rsb[l] = g.rsb ?? 2;
      data.glyphs[l] = Array.isArray(g.points) ? g.points : [];
    } else {
      lsb[l] = data.lsb?.[l] ?? 0; rsb[l] = data.rsb?.[l] ?? 2;
      data.glyphs[l] = Array.isArray(g) ? g : [];
    }
  }

  function maxX(pts) { return pts.length ? Math.max(...pts.map(p => p[0])) : 0; }
  function advance(l) { return (lsb[l] ?? 0) + maxX(data.glyphs[l]) + (rsb[l] ?? 2); }

  const nonEmpty = Object.keys(data.glyphs).filter(l => data.glyphs[l].length > 0);
  const numRows = Math.ceil(nonEmpty.length / PER_ROW);

  const rowData = [];
  for (let r = 0; r < numRows; r++) {
    const rowLetters = nonEmpty.slice(r * PER_ROW, (r + 1) * PER_ROW);
    let advX = 0;
    const positions = rowLetters.map(letter => {
      const glyphX = advX + (lsb[letter] ?? 0);
      advX += advance(letter);
      return { letter, glyphX };
    });
    rowData.push({ positions, totalWidth: advX });
  }

  const gridW = Math.max(...rowData.map(r => r.totalWidth), 1);
  const gridH = (numRows - 1) * ROW_STEP + LETTER_HEIGHT_UP + LETTER_HEIGHT_DOWN;
  const pad = 40;
  SCALE = Math.min(
    (canvas.width - 2 * pad) / gridW,
    (canvas.height - 2 * pad) / gridH
  );
  MARGIN = (canvas.width - gridW * SCALE) / 2;

  const verticalCenter = ((numRows - 1) * ROW_STEP) / 2 - LETTER_HEIGHT_UP / 2 + LETTER_HEIGHT_DOWN / 2;

  const instances = rowData.flatMap((row, rowIdx) =>
    row.positions.map(({ letter, glyphX }) =>
      createInstance(
        letter,
        glyphX,
        verticalCenter - rowIdx * ROW_STEP,
        data.glyphs[letter]
      )
    )
  );

  animate(instances);
}

main();
