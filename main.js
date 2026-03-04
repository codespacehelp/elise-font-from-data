const canvas = document.createElement("canvas");
canvas.width = 1000;
canvas.height = 1000;
document.body.appendChild(canvas);
const ctx = canvas.getContext("2d");

const SCALE = 20;
const MARGIN = 10;

let currentFont = null;

async function main() {
  const res = await fetch("fonts/nee.json");
  const data = await res.json();
  currentFont = data;
  ctx.strokeStyle = "black";
  ctx.lineWidth = 2;
  drawLetter(ctx, 0, 0, "a");
}

function drawLetter(ctx, x, y, letter) {
  const points = currentFont.glyphs[letter];
  if (!points) {
    console.warn(`Letter '${letter}' not found in font.`);
    return;
  }
  ctx.beginPath();
  let firstPoint = true;
  for (const [px, py] of points) {
    if (firstPoint) {
      ctx.moveTo(x * SCALE + px * SCALE + MARGIN, y * SCALE + py * SCALE + MARGIN);
      firstPoint = false;
    } else {
      ctx.lineTo(x * SCALE + px * SCALE + MARGIN, y * SCALE + py * SCALE + MARGIN);
    }
  }
  ctx.stroke();
}

main();
