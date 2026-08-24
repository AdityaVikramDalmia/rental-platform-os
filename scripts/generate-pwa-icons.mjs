#!/usr/bin/env node
/**
 * Generate PWA icons for Guard and Admin portals.
 * Zero external dependencies — uses only Node.js built-ins.
 *
 * Usage: node scripts/generate-pwa-icons.mjs
 *
 * Produces:
 *   public/icons/guard-192x192.png
 *   public/icons/guard-512x512.png
 *   public/icons/guard-180x180.png  (apple-touch-icon)
 *   public/icons/admin-192x192.png
 *   public/icons/admin-512x512.png
 *   public/icons/admin-180x180.png  (apple-touch-icon)
 *   public/favicon.svg              (shared browser-tab favicon)
 *
 * Replace these with real brand assets when available —
 * just keep the filenames and sizes identical.
 */

import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = resolve(__dirname, "..", "public");

// ── Portal configs ─────────────────────────────────────────────
const PORTALS = [
  {
    name: "guard",
    bg: [245, 158, 11], // amber-500 (#F59E0B)
    fg: [255, 255, 255], // white
    letter: "G",
  },
  {
    name: "admin",
    bg: [59, 130, 246], // blue-500 (#3B82F6)
    fg: [255, 255, 255], // white
    letter: "A",
  },
];
const SIZES = [192, 512, 180]; // 180 = apple-touch-icon

// ── Minimal PNG encoder (no dependencies) ──────────────────────
function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const combined = Buffer.concat([typeBytes, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(combined));
  return Buffer.concat([len, combined, crc]);
}

function createPNG(width, height, bgRGB, fgRGB, letter) {
  // Build RGBA pixel rows with filter byte 0x00 per row
  const rowBytes = 1 + width * 4; // filter byte + RGBA
  const raw = Buffer.alloc(height * rowBytes);

  // Simple circle + letter rendering
  const cx = width / 2;
  const cy = height / 2;
  const radius = width * 0.42;
  const letterSize = width * 0.45;

  // Pre-compute letter bitmap (simple block letter)
  const letterPixels = renderBlockLetter(letter, width, height, letterSize);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowBytes;
    raw[rowOffset] = 0; // no filter

    for (let x = 0; x < width; x++) {
      const px = rowOffset + 1 + x * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= radius) {
        // Inside circle — check if part of letter
        if (letterPixels[y * width + x]) {
          raw[px] = fgRGB[0];
          raw[px + 1] = fgRGB[1];
          raw[px + 2] = fgRGB[2];
          raw[px + 3] = 255;
        } else {
          raw[px] = bgRGB[0];
          raw[px + 1] = bgRGB[1];
          raw[px + 2] = bgRGB[2];
          raw[px + 3] = 255;
        }
        // Anti-alias edge
        if (dist > radius - 1.5) {
          const alpha = Math.max(0, Math.min(255, Math.round(((radius - dist) / 1.5) * 255)));
          raw[px + 3] = alpha;
        }
      } else {
        // Transparent
        raw[px] = 0;
        raw[px + 1] = 0;
        raw[px + 2] = 0;
        raw[px + 3] = 0;
      }
    }
  }

  // PNG signature
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // standard filter
  ihdr[12] = 0; // no interlace

  // IDAT
  const compressed = deflateSync(raw, { level: 9 });

  // IEND
  const iend = Buffer.alloc(0);

  return Buffer.concat([
    sig,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", iend),
  ]);
}

// ── Simple block letter renderer ───────────────────────────────
// Renders a bold sans-serif letter centered on the canvas.
// Uses a 5x7 bitmap font scaled up.
function renderBlockLetter(letter, canvasW, canvasH, size) {
  const FONT = {
    G: ["01110", "10001", "10000", "10111", "10001", "10001", "01110"],
    A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  };

  const bitmap = FONT[letter] || FONT["A"];
  const pixels = new Uint8Array(canvasW * canvasH);

  const charW = bitmap[0].length;
  const charH = bitmap.length;
  const scale = Math.floor(size / charH);
  const totalW = charW * scale;
  const totalH = charH * scale;
  const offsetX = Math.floor((canvasW - totalW) / 2);
  const offsetY = Math.floor((canvasH - totalH) / 2);

  for (let cy = 0; cy < charH; cy++) {
    for (let cx = 0; cx < charW; cx++) {
      if (bitmap[cy][cx] === "1") {
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            const px = offsetX + cx * scale + sx;
            const py = offsetY + cy * scale + sy;
            if (px >= 0 && px < canvasW && py >= 0 && py < canvasH) {
              pixels[py * canvasW + px] = 1;
            }
          }
        }
      }
    }
  }

  return pixels;
}

// ── SVG favicon (shared) ───────────────────────────────────────
function createFaviconSVG() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <circle cx="16" cy="16" r="14" fill="#1E293B"/>
  <text x="16" y="22" text-anchor="middle" fill="white"
        font-family="system-ui, sans-serif" font-size="18" font-weight="700">A</text>
</svg>`;
}

// ── Generate all icons ─────────────────────────────────────────
console.log("Generating PWA icons...\n");

for (const portal of PORTALS) {
  for (const size of SIZES) {
    const png = createPNG(size, size, portal.bg, portal.fg, portal.letter);
    const filename = `icons/${portal.name}-${size}x${size}.png`;
    const path = resolve(PUBLIC, filename);
    writeFileSync(path, png);
    console.log(`  ✓ ${filename} (${(png.length / 1024).toFixed(1)} KB)`);
  }
}

// Shared favicon
const faviconPath = resolve(PUBLIC, "favicon.svg");
writeFileSync(faviconPath, createFaviconSVG());
console.log("  ✓ favicon.svg");

console.log("\nDone! Replace with real brand assets when ready.");
console.log("Keep filenames and sizes identical.\n");
