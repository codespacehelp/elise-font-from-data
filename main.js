const canvas = document.createElement("canvas");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
document.body.appendChild(canvas);
const ctx = canvas.getContext("2d");

const SCALE = 20;
const MARGIN = 10;
const MAX_SPEED = 0.005;
let BASELINE_Y = canvas.height / 2;

window.addEventListener("resize", () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  BASELINE_Y = canvas.height / 2;
  ctx.lineWidth = 2;
});

let currentFont = null;
let hue = 30; // red in oklch

async function main() {
  const res = await fetch("fonts/nee.json");
  const data = await res.json();
  currentFont = data;

  const instances = [
    createInstance("a", 0, 0),
    createInstance("b", 14, 0),
    createInstance("b", 28, 0),
    createInstance("a", 42, 0),
  ];

  ctx.lineWidth = 2;
  animate(instances);
}

function createInstance(letter, gridX, gridY) {
  const pts = currentFont.glyphs[letter];
  return {
    gridX,
    gridY,
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
    inst.velocities[i][0] += (Math.random() - 0.5) * 0.0005;
    inst.velocities[i][1] += (Math.random() - 0.5) * 0.0005;

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
  hue = (hue + 0.05) % 360;
  ctx.strokeStyle = `oklch(0.3 0.2 ${hue} / 0.04)`;
  for (const inst of instances) {
    drawInstance(inst);
    updateInstance(inst);
  }
  requestAnimationFrame(() => animate(instances));
}

main();
