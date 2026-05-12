// Run: node scripts/generate-icons.mjs
// Generates simple SVG-based icons then converts via sharp if available
import { writeFileSync } from "fs";

const svgIcon = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${size * 0.2}" fill="#C9ADEE"/>
  <circle cx="${size*0.5}" cy="${size*0.35}" r="${size*0.18}" fill="#FFD6B8"/>
  <ellipse cx="${size*0.5}" cy="${size*0.28}" rx="${size*0.21}" ry="${size*0.18}" fill="#F2E05A"/>
  <rect x="${size*0.35}" y="${size*0.52}" width="${size*0.3}" height="${size*0.25}" rx="4" fill="#AADDFF"/>
  <rect x="${size*0.42}" y="${size*0.77}" width="${size*0.07}" height="${size*0.16}" rx="4" fill="#F5B8D8"/>
  <rect x="${size*0.51}" y="${size*0.77}" width="${size*0.07}" height="${size*0.16}" rx="4" fill="#F5B8D8"/>
</svg>`;

writeFileSync("public/icon-192.svg", svgIcon(192));
writeFileSync("public/icon-512.svg", svgIcon(512));
console.log("SVG icons written. Convert to PNG manually if needed.");
