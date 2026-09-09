const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

function createIcon(size) {
  const png = new PNG({ width: size, height: size });
  const center = size / 2;
  const radius = size * 0.45;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (size * y + x) << 2;

      // Rounded rectangle mask (border radius ~ 20%)
      const cornerRadius = size * 0.22;
      let inShape = true;
      let dx = 0, dy = 0;

      if (x < cornerRadius) dx = cornerRadius - x;
      else if (x > size - cornerRadius) dx = x - (size - cornerRadius);

      if (y < cornerRadius) dy = cornerRadius - y;
      else if (y > size - cornerRadius) dy = y - (size - cornerRadius);

      if (dx > 0 && dy > 0) {
        inShape = (dx * dx + dy * dy) <= (cornerRadius * cornerRadius);
      }

      if (!inShape) {
        png.data[idx] = 0;
        png.data[idx + 1] = 0;
        png.data[idx + 2] = 0;
        png.data[idx + 3] = 0;
        continue;
      }

      // Sky Blue / Slate Gradient background (#0284c7 -> #0f172a)
      const t = (x + y) / (size * 2);
      const r = Math.round(2 + t * (15 - 2));
      const g = Math.round(132 + t * (23 - 132));
      const b = Math.round(199 + t * (42 - 199));

      // Draw a sleek white accounting symbol (ledger + bar chart) in the middle
      const nx = (x - center) / size;
      const ny = (y - center) / size;

      let isSymbol = false;

      // Outer ring or box
      if (Math.abs(nx) < 0.28 && Math.abs(ny) < 0.28) {
        // Bar 1
        if (nx >= -0.22 && nx <= -0.10 && ny >= -0.15 && ny <= 0.18) isSymbol = true;
        // Bar 2
        if (nx >= -0.06 && nx <= 0.06 && ny >= -0.22 && ny <= 0.18) isSymbol = true;
        // Bar 3
        if (nx >= 0.10 && nx <= 0.22 && ny >= -0.28 && ny <= 0.18) isSymbol = true;
        // Base line
        if (nx >= -0.24 && nx <= 0.24 && ny >= 0.18 && ny <= 0.24) isSymbol = true;
      }

      if (isSymbol) {
        png.data[idx] = 255;
        png.data[idx + 1] = 255;
        png.data[idx + 2] = 255;
        png.data[idx + 3] = 255;
      } else {
        png.data[idx] = r;
        png.data[idx + 1] = g;
        png.data[idx + 2] = b;
        png.data[idx + 3] = 255;
      }
    }
  }

  return png;
}

const publicDir = path.join(__dirname, '..', 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

createIcon(192).pack().pipe(fs.createWriteStream(path.join(publicDir, 'icon-192.png'))).on('finish', () => console.log('icon-192.png created'));
createIcon(512).pack().pipe(fs.createWriteStream(path.join(publicDir, 'icon-512.png'))).on('finish', () => console.log('icon-512.png created'));

// Generate SVG Favicon
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <rect width="100" height="100" rx="22" fill="url(#grad)" />
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0284c7" />
      <stop offset="100%" stop-color="#0f172a" />
    </linearGradient>
  </defs>
  <rect x="25" y="45" width="12" height="33" rx="3" fill="#ffffff" />
  <rect x="44" y="32" width="12" height="46" rx="3" fill="#ffffff" />
  <rect x="63" y="22" width="12" height="56" rx="3" fill="#ffffff" />
  <rect x="20" y="78" width="60" height="6" rx="2" fill="#ffffff" />
</svg>`;

fs.writeFileSync(path.join(publicDir, 'favicon.svg'), svgContent, 'utf8');
console.log('favicon.svg created');
