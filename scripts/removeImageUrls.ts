#!/usr/bin/env tsx
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '../../../data/poe2/Rise of the Abyssal');

console.log('Removing image URLs from JSON files...');
console.log(`Data directory: ${dataDir}`);

let filesProcessed = 0;
let urlsRemoved = 0;

/**
 * Recursively remove all HTTP/HTTPS URLs from an object
 */
function removeUrls(obj: any): any {
  if (typeof obj === 'string') {
    // If it's a URL, return empty string or null
    if (obj.startsWith('http://') || obj.startsWith('https://')) {
      urlsRemoved++;
      return ''; // Return empty string instead of removing the field
    }
    return obj;
  } else if (Array.isArray(obj)) {
    return obj.map(removeUrls);
  } else if (obj && typeof obj === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = removeUrls(value);
    }
    return result;
  }
  return obj;
}

// Process all JSON files
const jsonFiles = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));

for (const file of jsonFiles) {
  try {
    const filePath = path.join(dataDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);
    
    const cleaned = removeUrls(data);
    
    // Write back with pretty formatting
    fs.writeFileSync(filePath, JSON.stringify(cleaned, null, 2), 'utf-8');
    filesProcessed++;
    
    process.stdout.write(`\rProcessed: ${filesProcessed}/${jsonFiles.length} files, Removed: ${urlsRemoved} URLs`);
  } catch (err) {
    console.error(`\nFailed to process ${file}:`, err);
  }
}

console.log('\n\nURL removal complete!');
console.log(`Files processed: ${filesProcessed}`);
console.log(`URLs removed: ${urlsRemoved}`);
console.log(`\nNote: Image fields now contain empty strings instead of URLs.`);
console.log(`Images will be resolved from bundled-images/ directory only.`);
