const canvas = document.createElement("canvas");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
document.body.appendChild(canvas);
const ctx = canvas.getContext("2d");

// Offscreen canvas for BLOB metaball effect
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

// ─── Effect assignment ────────────────────────────────────────────────────────
// a-e: COLONY   f-j: BLOB   k-o: GLITCH   p-t: RUST   u-z: SPORE
const EFFECT_MAP = {
  a:'colony', b:'colony', c:'colony', d:'colony', e:'colony',
  f:'blob',   g:'blob',   h:'blob',   i:'blob',   j:'blob',
  k:'glitch', l:'glitch', m:'glitch', n:'glitch', o:'glitch',
  p:'rust',   q:'rust',   r:'rust',   s:'rust',   t:'rust',
  u:'spore',  v:'spore',  w:'spore',  x:'spore',  y:'spore',  z:'spore',
};

const SPACING   = { colony: 1.8, blob: 1.4, glitch: 0.55, rust: 1.6, spore: 1.0 };
const WOBBLE_N  = 20;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function wobbleShape(n) {
  return Array.from({ length: n }, () => 0.65 + Math.random() * 0.7);
}

function toCanvas(inst, gx, gy) {
  return [
    inst.gridX * SCALE + gx * SCALE + MARGIN,
    BASELINE_Y - inst.gridY * SCALE - gy * SCALE,
  ];
}

function drawRaggedCircle(cx, cy, r, wobbles) {
  ctx.beginPath();
  const n = wobbles.length;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const w = wobbles[i % n];
    const px = cx + Math.cos(a) * r * w;
    const py = cy + Math.sin(a) * r * w;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath();
}

// ─── Particle factories ───────────────────────────────────────────────────────
function makeParticle(x, y, effect, strokeAngle, bbox) {
  if (effect === 'colony') {
    const isRust = Math.random() < 0.28;
    return {
      type: 'colony', x, y,
      radius: 0.4 + Math.random() * 0.4,
      maxRadius: 1.4 + Math.random() * 2.0,
      growRate: 0.003 + Math.random() * 0.004,
      hue: isRust ? 28 + Math.random() * 32 : 176 + Math.random() * 28,
      isRust,
      wobbles: wobbleShape(WOBBLE_N),
      // Satellite sub-colonies (1-3 smaller circles around the main one)
      satellites: Array.from({ length: Math.floor(Math.random() * 3) }, () => ({
        angle: Math.random() * Math.PI * 2,
        dist:  0.6 + Math.random() * 1.0,   // grid units
        ratio: 0.3 + Math.random() * 0.45,  // fraction of main radius
        wobbles: wobbleShape(12),
      })),
    };
  }

  if (effect === 'blob') return {
    type: 'blob', x, y, origX: x, origY: y,
    radius: 1.0 + Math.random() * 0.8,
    maxRadius: 2.8 + Math.random() * 3.5,
    growRate: 0.002 + Math.random() * 0.003,
    phase: Math.random() * Math.PI * 2,
    breathe: 0.04 + Math.random() * 0.07,
  };

  if (effect === 'glitch') {
    // Horizontal bars filling the letter width
    const nBars = 2 + Math.floor(Math.random() * 5);
    return {
      type: 'glitch', x, y,
      bars: Array.from({ length: nBars }, () => {
        const full = Math.random() < 0.65;
        return {
          dy:      (Math.random() - 0.5) * 1.0,      // vertical offset (grid units)
          leftExt: full ? (x - bbox.minX + 0.4) : (x - bbox.minX) * (0.3 + Math.random() * 0.7),
          rightExt:full ? (bbox.maxX - x + 0.4) : (bbox.maxX - x) * (0.3 + Math.random() * 0.7),
          h:       0.07 + Math.random() * 0.28,       // bar height (grid units)
          alpha:   0.55 + Math.random() * 0.45,
        };
      }),
      phase:     Math.random() * Math.PI * 2,
      shiftRate: 0.008 + Math.random() * 0.016,
    };
  }

  if (effect === 'rust') return {
    type: 'rust', x, y,
    radius: 0.6 + Math.random() * 1.0,
    maxRadius: 4.0 + Math.random() * 6.0,   // grows very large
    growRate: 0.005 + Math.random() * 0.007,
    hue:  18 + Math.random() * 50,           // rust → amber → ochre
    wobbles: wobbleShape(WOBBLE_N),
    layers: 3 + Math.floor(Math.random() * 4),
  };

  if (effect === 'spore') return {
    type: 'spore', x, y,
    dots: Array.from({ length: 10 + Math.floor(Math.random() * 18) }, () => ({
      dx:    (Math.random() - 0.5) * 3.5,
      dy:    (Math.random() - 0.5) * 3.5,
      r:     0.06 + Math.random() * 0.38,
      hue:   170 + Math.random() * 35,
      alpha: 0.35 + Math.random() * 0.55,
      vx:    (Math.random() - 0.5) * 0.0015,
      vy:    (Math.random() - 0.5) * 0.0015,
    })),
  };
}

// ─── Update ───────────────────────────────────────────────────────────────────
function updateParticle(p) {
  if (p.type === 'blob') {
    if (p.radius < p.maxRadius) p.radius += p.growRate;
    p.x = p.origX + Math.sin(frameCount * 0.0009 + p.phase) * p.breathe;
    p.y = p.origY + Math.cos(frameCount * 0.0011 + p.phase * 1.3) * p.breathe;
    return;
  }
  if (p.type === 'colony' || p.type === 'rust') {
    if (p.radius < p.maxRadius) p.radius += p.growRate;
    return;
  }
  if (p.type === 'spore') {
    for (const d of p.dots) { d.dx += d.vx; d.dy += d.vy; }
  }
  // glitch: no position update (animation via frameCount)
}

// ─── Drawing ──────────────────────────────────────────────────────────────────
function drawStroke(inst) {
  ctx.beginPath();
  let first = true;
  for (const [px, py] of inst.origPts) {
    const [cx, cy] = toCanvas(inst, px, py);
    first ? ctx.moveTo(cx, cy) : ctx.lineTo(cx, cy);
    first = false;
  }
  ctx.strokeStyle = 'rgba(50, 43, 33, 0.55)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawInstance(inst) {
  if (inst.effectType === 'blob') {
    for (const p of inst.particles) {
      const [cx, cy] = toCanvas(inst, p.x, p.y);
      const r = Math.max(4, p.radius * SCALE);
      blobCtx.beginPath();
      blobCtx.arc(cx, cy, r, 0, Math.PI * 2);
      blobCtx.fill();
    }
    return;
  }

  if (inst.effectType === 'colony') {
    for (const p of inst.particles) {
      const [cx, cy] = toCanvas(inst, p.x, p.y);
      const r = Math.max(2, p.radius * SCALE);

      // Rust stain halo underneath
      if (p.isRust) {
        const sr = r * 3.5;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, sr);
        g.addColorStop(0,   `oklch(0.50 0.15 ${p.hue} / 0.22)`);
        g.addColorStop(0.4, `oklch(0.56 0.12 ${p.hue} / 0.12)`);
        g.addColorStop(1,   `oklch(0.62 0.09 ${p.hue} / 0)`);
        ctx.beginPath();
        ctx.arc(cx, cy, sr, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
      }

      // Satellite sub-colonies
      for (const sat of p.satellites) {
        const satR = r * sat.ratio;
        if (satR < 1.5) continue;
        const satCx = cx + Math.cos(sat.angle) * sat.dist * SCALE;
        const satCy = cy - Math.sin(sat.angle) * sat.dist * SCALE;
        drawRaggedCircle(satCx, satCy, satR, sat.wobbles);
        ctx.fillStyle = `oklch(${p.isRust ? 0.40 : 0.27} 0.13 ${p.hue} / 0.78)`;
        ctx.fill();
      }

      // Main colony disc
      drawRaggedCircle(cx, cy, r, p.wobbles);
      ctx.fillStyle = `oklch(${p.isRust ? 0.35 : 0.24} 0.14 ${p.hue} / 0.88)`;
      ctx.fill();
    }
    return;
  }

  if (inst.effectType === 'glitch') {
    ctx.save();
    for (const p of inst.particles) {
      const [cx, cy] = toCanvas(inst, p.x, p.y);
      // Slight horizontal drift over time (glitch "corruption" feel)
      const shift = Math.sin(frameCount * p.shiftRate + p.phase) * SCALE * 0.25;

      for (const bar of p.bars) {
        const bx = cx - bar.leftExt * SCALE + shift;
        const by = cy - bar.dy * SCALE - (bar.h * SCALE) / 2;
        const bw = (bar.leftExt + bar.rightExt) * SCALE;
        const bh = Math.max(1, bar.h * SCALE);
        ctx.fillStyle = `rgba(12, 8, 4, ${bar.alpha})`;
        ctx.fillRect(bx, by, bw, bh);
      }
    }
    ctx.restore();
    return;
  }

  if (inst.effectType === 'rust') {
    for (const p of inst.particles) {
      const [cx, cy] = toCanvas(inst, p.x, p.y);
      const r = Math.max(3, p.radius * SCALE);
      // Multiple ragged layers — like a spreading watercolour wash
      for (let i = p.layers; i >= 1; i--) {
        const lr = r * (0.35 + 0.65 * (i / p.layers));
        const la = 0.025 + 0.035 * (1 - (i - 1) / p.layers);
        const ll = 0.52 - 0.08 * (i / p.layers);
        drawRaggedCircle(cx, cy, lr, p.wobbles);
        ctx.fillStyle = `oklch(${ll} 0.17 ${p.hue} / ${la})`;
        ctx.fill();
      }
    }
    return;
  }

  if (inst.effectType === 'spore') {
    for (const p of inst.particles) {
      const [cx, cy] = toCanvas(inst, p.x, p.y);
      for (const d of p.dots) {
        const r = Math.max(1, d.r * SCALE);
        ctx.beginPath();
        ctx.arc(cx + d.dx * SCALE, cy - d.dy * SCALE, r, 0, Math.PI * 2);
        ctx.fillStyle = `oklch(0.26 0.13 ${d.hue} / ${d.alpha})`;
        ctx.fill();
      }
    }
  }
}

// ─── Sampling helper ──────────────────────────────────────────────────────────
function sampleAlongStroke(pts, spacing) {
  const samples = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    const steps = Math.max(1, Math.floor(len / spacing));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      samples.push([x0 + dx * t, y0 + dy * t, angle]);
    }
  }
  if (pts.length > 0) {
    const last = pts[pts.length - 1];
    const prev = pts.length > 1 ? pts[pts.length - 2] : last;
    samples.push([last[0], last[1], Math.atan2(last[1] - prev[1], last[0] - prev[0])]);
  }
  return samples;
}

// ─── Animation loop ───────────────────────────────────────────────────────────
function animate(instances) {
  frameCount++;

  ctx.fillStyle = '#f5f2ec';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  blobCtx.fillStyle = 'white';
  blobCtx.fillRect(0, 0, blobOff.width, blobOff.height);
  blobCtx.fillStyle = '#080e04'; // very dark green blob circles

  for (const inst of instances) drawStroke(inst);
  for (const inst of instances) drawInstance(inst);
  for (const inst of instances)
    for (const p of inst.particles) updateParticle(p);

  // Composite blob metaball layer
  const blobBlur = Math.max(4, Math.min(14, Math.round(SCALE * 1.8)));
  ctx.save();
  ctx.filter = `blur(${blobBlur}px) contrast(18)`;
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(blobOff, 0, 0);
  ctx.restore();

  requestAnimationFrame(() => animate(instances));
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────
async function main() {
  ctx.fillStyle = '#f5f2ec';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const res = await fetch("../fonts/nee.json");
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
    row.positions.map(({ letter, glyphX }) => {
      const effect = EFFECT_MAP[letter] || 'colony';
      const pts = data.glyphs[letter];
      // Bounding box (in glyph coordinates) — needed for glitch bar extent
      const xs = pts.map(p => p[0]);
      const ys = pts.map(p => p[1]);
      const bbox = {
        minX: xs.length ? Math.min(...xs) : 0,
        maxX: xs.length ? Math.max(...xs) : 1,
        minY: ys.length ? Math.min(...ys) : 0,
        maxY: ys.length ? Math.max(...ys) : 1,
      };
      const samples = sampleAlongStroke(pts, SPACING[effect]);
      return {
        gridX: glyphX,
        gridY: verticalCenter - rowIdx * ROW_STEP,
        origPts: pts,
        effectType: effect,
        particles: samples.map(([px, py, angle]) => makeParticle(px, py, effect, angle, bbox)),
      };
    })
  );

  for (const inst of instances) drawStroke(inst);
  animate(instances);
}

main();
