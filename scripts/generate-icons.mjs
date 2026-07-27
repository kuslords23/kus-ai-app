import sharp from "sharp";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(root, "public");

const svg = `
<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1a1028"/>
      <stop offset="100%" style="stop-color:#0c0a14"/>
    </linearGradient>
    <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#f0d060"/>
      <stop offset="100%" style="stop-color:#b8860b"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="108" fill="url(#bg)"/>
  <rect x="24" y="24" width="464" height="464" rx="92" fill="none" stroke="#d4af37" stroke-width="4" opacity="0.35"/>
  <text x="256" y="300" text-anchor="middle" font-size="220" fill="url(#gold)" font-family="Georgia,serif" font-weight="bold">👑</text>
</svg>
`;

async function main() {
  const base = sharp(Buffer.from(svg));
  await base.resize(512, 512).png().toFile(join(publicDir, "icon-512.png"));
  await base.resize(192, 192).png().toFile(join(publicDir, "icon-192.png"));
  await base.resize(180, 180).png().toFile(join(publicDir, "apple-touch-icon.png"));
  console.log("Generated PWA icons (192, 512, apple-touch-icon)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
