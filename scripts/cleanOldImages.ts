#!/usr/bin/env tsx
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const imageDir = path.resolve(__dirname, '../bundled-images');

console.log('Cleaning old poedb images...');
console.log(`Image directory: ${imageDir}`);

if (!fs.existsSync(imageDir)) {
  console.log('No bundled-images directory found - nothing to clean');
  process.exit(0);
}

const files = fs.readdirSync(imageDir);
let removed = 0;
let kept = 0;

for (const file of files) {
  try {
    const filePath = path.join(imageDir, file);
    
    // Decode base64 filename to check if it's a poedb URL
    const base64Part = file.replace(/\.webp$/, '');
    const decoded = Buffer.from(base64Part, 'base64').toString('utf-8');
    
    if (decoded.includes('poe2db') || decoded.includes('poedb')) {
      fs.unlinkSync(filePath);
      removed++;
      if (removed % 100 === 0) {
        process.stdout.write(`\rRemoved: ${removed}, Kept: ${kept}`);
      }
    } else {
      kept++;
    }
  } catch (err) {
    // Not a valid base64 filename or error decoding, skip
    kept++;
  }
}

console.log(`\n\nCleanup complete!`);
console.log(`Removed poedb images: ${removed}`);
console.log(`Kept official CDN images: ${kept}`);
console.log(`\nYou can now run the download script to fetch from official PoE CDN.`);
