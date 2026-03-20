const canvas = document.createElement("canvas");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
document.body.appendChild(canvas);
const ctx = canvas.getContext("2d");

let SCALE = 20;
let MARGIN = 40;
const MAX_SPEED = 0.05;
let BASELINE_Y = canvas.height / 2;

window.addEventListener("resize", () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  BASELINE_Y = canvas.height / 2;
  ctx.lineWidth = 2;
});

let currentFont = null;

async function main() {
  const res = await fetch("../fonts/outline-nee-s0.17-r30.json");
  const data = await res.json();
  currentFont = data;

  const PER_ROW = 5;
  const ROW_STEP = 20;
  const LETTER_HEIGHT_UP = 16;
  const LETTER_HEIGHT_DOWN = 3;

  // Normaliseer glyphs: nieuw formaat { lsb, rsb, points } of oud formaat (array)
  const lsb = {}, rsb = {};
  for (const [l, g] of Object.entries(data.glyphs)) {
    if (g && !Array.isArray(g)) {
      lsb[l] = g.lsb ?? 0;
      rsb[l] = g.rsb ?? 2;
      data.glyphs[l] = Array.isArray(g.points) ? g.points : [];
    } else {
      lsb[l] = data.lsb?.[l] ?? 0;
      rsb[l] = data.rsb?.[l] ?? 2;
      data.glyphs[l] = Array.isArray(g) ? g : [];
    }
  }

  function maxX(pts) { return pts.length ? Math.max(...pts.map(p => p[0])) : 0; }
  function advance(l) { return (lsb[l] ?? 0) + maxX(data.glyphs[l]) + (rsb[l] ?? 2); }

  const nonEmpty = Object.keys(data.glyphs).filter(l => data.glyphs[l].length > 0);
  const numRows = Math.ceil(nonEmpty.length / PER_ROW);

  // Row-based sequential layout: each letter takes exactly its own advance width
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
      createInstance(letter, glyphX, verticalCenter - rowIdx * ROW_STEP)
    )
  );

  ctx.lineWidth = 2;
  animate(instances);
}

function createInstance(letter, gridX, gridY) {
  const pts = currentFont.glyphs[letter];
  return {
    gridX,
    gridY,
    hue: Math.random() * 120 + 40, // random start in mold range (rust 40 → grey-green 160)
    points: pts.map(([px, py]) => [px, py]),
    velocities: pts.map(() => [(Math.random() - 0.5) * 0.004, (Math.random() - 0.5) * 0.004]),
  };
}

function drawInstance(inst) {
  ctx.beginPath();
  let first = true;
  for (const [px, py] of inst.points) {
    const cx = inst.gridX * SCALE + px * SCALE + MARGIN;
    const cy = BASELINE_Y - inst.gridY * SCALE - py * SCALE;
    if (first) {
      ctx.moveTo(cx, cy);
      first = false;
    } else {
      ctx.lineTo(cx, cy);
    }
  }
  ctx.stroke();
}

function updateInstance(inst) {
  for (let i = 0; i < inst.points.length; i++) {
    inst.velocities[i][0] += (Math.random() - 0.5) * 0.005;
    inst.velocities[i][1] += (Math.random() - 0.5) * 0.005;

    const [vx, vy] = inst.velocities[i];
    const speed = Math.sqrt(vx * vx + vy * vy);
    if (speed > MAX_SPEED) {
      inst.velocities[i][0] = (vx / speed) * MAX_SPEED;
      inst.velocities[i][1] = (vy / speed) * MAX_SPEED;
    }

    inst.points[i][0] += inst.velocities[i][0];
    inst.points[i][1] += inst.velocities[i][1];
  }
}

function animate(instances) {
  for (const inst of instances) {
    inst.hue = (inst.hue + 0.02) % 120 + 40;
    const lightness = inst.hue < 90 ? 0.48 : 0.30;
    ctx.strokeStyle = `oklch(${lightness} 0.07 ${inst.hue} / 0.04)`;
    drawInstance(inst);
    updateInstance(inst);
  }
  requestAnimationFrame(() => animate(instances));
}

main();
