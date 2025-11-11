// Create a proper ICO file with multiple sizes for Windows
// Includes: 256x256, 128x128, 64x64, 48x48, 32x32, 16x16

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Function to create pixel data for a given size
function createPixelData(size) {
  const pixels = [];
  const centerX = size / 2;
  const centerY = size / 2;
  const maxRadius = size / 2 - 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const distance = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));

      if (distance < maxRadius - 4) {
        // Inner circle - bright green gradient
        const gradient = 1 - (distance / maxRadius);
        const green = Math.floor(0xAA + (0x33 * gradient));
        pixels.push(0x00, green, 0x00, 0xFF); // BGRA
      } else if (distance < maxRadius - 2) {
        // Mid border - medium green
        pixels.push(0x00, 0x77, 0x00, 0xFF);
      } else if (distance < maxRadius) {
        // Outer border - dark green
        pixels.push(0x00, 0x44, 0x00, 0xFF);
      } else {
        // Outside - transparent
        pixels.push(0x00, 0x00, 0x00, 0x00);
      }
    }
  }

  return Buffer.from(pixels);
}

// Function to create BMP data for ICO
function createBMP(size) {
  const pixelData = createPixelData(size);

  const bmpHeaderSize = 40;
  const bmpHeader = Buffer.alloc(bmpHeaderSize);
  bmpHeader.writeUInt32LE(bmpHeaderSize, 0); // Header size
  bmpHeader.writeInt32LE(size, 4); // Width
  bmpHeader.writeInt32LE(size * 2, 8); // Height (doubled for ICO)
  bmpHeader.writeUInt16LE(1, 12); // Planes
  bmpHeader.writeUInt16LE(32, 14); // Bits per pixel
  bmpHeader.writeUInt32LE(0, 16); // Compression
  bmpHeader.writeUInt32LE(0, 20); // Image size
  bmpHeader.writeInt32LE(0, 24); // X pixels per meter
  bmpHeader.writeInt32LE(0, 28); // Y pixels per meter
  bmpHeader.writeUInt32LE(0, 32); // Colors used
  bmpHeader.writeUInt32LE(0, 36); // Important colors

  // AND mask (all zeros)
  const andMaskSize = Math.ceil((size * size) / 8);
  const andMask = Buffer.alloc(andMaskSize);

  return Buffer.concat([bmpHeader, pixelData, andMask]);
}

// Create ICO with multiple sizes
const sizes = [256, 128, 64, 48, 32, 16];
const images = sizes.map(size => createBMP(size));

// ICO file header
const icoHeader = Buffer.alloc(6);
icoHeader.writeUInt16LE(0, 0); // Reserved
icoHeader.writeUInt16LE(1, 2); // Type: 1 = ICO
icoHeader.writeUInt16LE(sizes.length, 4); // Number of images

// Image directory entries
const dirEntries = [];
let imageOffset = 6 + (16 * sizes.length); // Header + directory entries

for (let i = 0; i < sizes.length; i++) {
  const size = sizes[i];
  const imageData = images[i];

  const entry = Buffer.alloc(16);
  entry.writeUInt8(size === 256 ? 0 : size, 0); // Width (0 means 256)
  entry.writeUInt8(size === 256 ? 0 : size, 1); // Height (0 means 256)
  entry.writeUInt8(0, 2); // Color palette
  entry.writeUInt8(0, 3); // Reserved
  entry.writeUInt16LE(1, 4); // Color planes
  entry.writeUInt16LE(32, 6); // Bits per pixel
  entry.writeUInt32LE(imageData.length, 8); // Image size
  entry.writeUInt32LE(imageOffset, 12); // Image offset

  dirEntries.push(entry);
  imageOffset += imageData.length;
}

// Combine all parts
const icoData = Buffer.concat([
  icoHeader,
  ...dirEntries,
  ...images
]);

// Write to file
const outputPath = path.join(__dirname, 'public', 'icon.ico');
fs.writeFileSync(outputPath, icoData);

console.log(`✅ Icon created successfully at: ${outputPath}`);
console.log(`📦 File size: ${icoData.length} bytes`);
console.log(`🖼️  Includes sizes: ${sizes.join('x, ')}x`);
