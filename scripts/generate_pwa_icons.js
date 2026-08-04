const fs = require('fs');
const path = require('path');

// Ensure public/images/icons directory exists
const iconsDir = path.join(__dirname, '../public/images/icons');
if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
}

// Generate simple SVG icons for 192x192 and 512x512
const svg192 = `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192">
  <rect width="192" height="192" fill="#4f46e5" rx="36"/>
  <path d="M48 60 h96 v12 h-96 z M48 88 h96 v12 h-96 z M48 116 h60 v12 h-60 z" fill="#ffffff"/>
  <circle cx="136" cy="122" r="16" fill="#10b981"/>
</svg>`;

const svg512 = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#4f46e5" rx="96"/>
  <path d="M128 160 h256 v32 h-256 z M128 234 h256 v32 h-256 z M128 308 h160 v32 h-160 z" fill="#ffffff"/>
  <circle cx="364" cy="324" r="44" fill="#10b981"/>
</svg>`;

fs.writeFileSync(path.join(iconsDir, 'icon-192.svg'), svg192);
fs.writeFileSync(path.join(iconsDir, 'icon-512.svg'), svg512);

console.log('PWA SVG Icons created successfully in public/images/icons/');
