// ─── Canvas setup ─────────────────────────────────────────────────────────────
const canvas = document.createElement("canvas");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
document.body.appendChild(canvas);
const ctx = canvas.getContext("2d");

// Offscreen canvas for metaball blur+contrast trick
const blobOff = document.createElement("canvas");
blobOff.width = canvas.width;
blobOff.height = canvas.height;
const blobCtx = blobOff.getContext("2d");

let SCALE = 20;
let MARGIN = 40;
let BASELINE_Y = canvas.height / 2;
let frameCount = 0;

window.addEventListener("resize", () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  blobOff.width = canvas.width;
  blobOff.height = canvas.height;
  BASELINE_Y = canvas.height / 2;
});

// ─── Coordinate transform ─────────────────────────────────────────────────────
function toCanvas(inst, gx, gy) {
  return [
    inst.gridX * SCALE + gx * SCALE + MARGIN,
    BASELINE_Y - inst.gridY * SCALE - gy * SCALE,
  ];
}

// ─── Instance creation ────────────────────────────────────────────────────────
// Each glyph point becomes one "ball" that oscillates around its origin.
// The letter skeleton is redrawn each frame connecting balls in their original
// adjacency order — so the letter form slowly mutates as balls drift.
function createInstance(letter, gridX, gridY, pts) {
  return {
    letter, gridX, gridY,
    balls: pts.map(([x, y]) => ({
      origX: x, origY: y,
      // Independent Lissajous oscillation per ball — unique letter mutations
      freqX:  0.00035 + Math.random() * 0.0006,
      freqY:  0.00035 + Math.random() * 0.0006,
      phaseX: Math.random() * Math.PI * 2,
      phaseY: Math.random() * Math.PI * 2,
      // Amplitude: how far the ball can stray from its origin (grid units)
      ampX: 0.6 + Math.random() * 1.6,
      ampY: 0.6 + Math.random() * 1.6,
      // Blob size grows over time
      radius:   0.0,
      maxR:     1.6 + Math.random() * 2.8,
      growRate: 0.0012 + Math.random() * 0.0018,
    })),
  };
}

// Current position of a ball this frame
function ballPos(b) {
  return [
    b.origX + Math.sin(frameCount * b.freqX + b.phaseX) * b.ampX,
    b.origY + Math.cos(frameCount * b.freqY + b.phaseY) * b.ampY,
  ];
}

// ─── Draw ─────────────────────────────────────────────────────────────────────
function drawInstance(inst) {
  const positions = inst.balls.map(b => ballPos(b));

  // ── Mutated skeleton ──
  // Connect balls in their original polyline order.
  // As balls drift, the skeleton deforms — you get a living, morphing letter.
  if (positions.length > 1) {
    ctx.beginPath();
    let first = true;
    for (const [bx, by] of positions) {
      const [cx, cy] = toCanvas(inst, bx, by);
      first ? ctx.moveTo(cx, cy) : ctx.lineTo(cx, cy);
      first = false;
    }
    ctx.strokeStyle = 'rgba(15, 28, 8, 0.42)';
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }

  // ── Blobs (drawn to offscreen canvas for metaball composite) ──
  for (let i = 0; i < inst.balls.length; i++) {
    const b = inst.balls[i];
    const [bx, by] = positions[i];
    const [cx, cy] = toCanvas(inst, bx, by);
    const r = Math.max(3, b.radius * SCALE);
    blobCtx.beginPath();
    blobCtx.arc(cx, cy, r, 0, Math.PI * 2);
    blobCtx.fill();
  }
}

// ─── Update ───────────────────────────────────────────────────────────────────
function updateInstance(inst) {
  for (const b of inst.balls) {
    if (b.radius < b.maxR) b.radius += b.growRate;
  }
}

// ─── Animation loop ───────────────────────────────────────────────────────────
function animate(instances) {
  frameCount++;

  ctx.fillStyle = '#f5f2ec';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  blobCtx.fillStyle = 'white';
  blobCtx.fillRect(0, 0, blobOff.width, blobOff.height);
  blobCtx.fillStyle = '#050c02'; // very dark green blob fill

  for (const inst of instances) drawInstance(inst);
  for (const inst of instances) updateInstance(inst);

  // Metaball composite: blur spreads blobs, contrast snaps edges together
  // multiply blend: white = invisible, dark = shows on cream background
  const blur = Math.max(4, Math.min(14, Math.round(SCALE * 1.7)));
  ctx.save();
  ctx.filter = `blur(${blur}px) contrast(18)`;
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(blobOff, 0, 0);
  ctx.restore();

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
