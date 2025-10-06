#!/usr/bin/env tsx
import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '../../../data/poe2/Rise of the Abyssal');
const imageDir = path.resolve(__dirname, '../bundled-images');

// Create image directory if it doesn't exist
if (!fs.existsSync(imageDir)) {
  fs.mkdirSync(imageDir, { recursive: true });
}

// Collect all unique image URLs from JSON files
const imageUrls = new Set<string>();

function scanJsonFile(filePath: string) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);
    
    // Recursively find all image URLs
    function findImages(obj: any) {
      if (typeof obj === 'string' && (obj.startsWith('http://') || obj.startsWith('https://'))) {
        if (obj.includes('/image/') || obj.endsWith('.webp') || obj.endsWith('.png') || obj.endsWith('.jpg')) {
          imageUrls.add(obj);
        }
      } else if (Array.isArray(obj)) {
        obj.forEach(findImages);
      } else if (obj && typeof obj === 'object') {
        Object.values(obj).forEach(findImages);
      }
    }
    
    findImages(data);
  } catch (err) {
    console.warn(`Failed to process ${filePath}:`, err);
  }
}

// Scan all JSON files
console.log('Scanning JSON files for image URLs...');
const jsonFiles = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));
jsonFiles.forEach(file => {
  scanJsonFile(path.join(dataDir, file));
});

console.log(`Found ${imageUrls.size} unique image URLs`);

// Download function
function downloadImage(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      // Create filename from base64-encoded URL
      const fname = Buffer.from(url).toString('base64') + '.webp';
      const target = path.join(imageDir, fname);
      
      // Skip if already exists
      if (fs.existsSync(target) && fs.statSync(target).size > 0) {
        resolve(target);
        return;
      }
      
      const urlObj = new URL(url);
      const options = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      };
      
      https.get(options, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          // Follow redirect
          const redirectUrl = res.headers.location;
          if (redirectUrl) {
            resolve(downloadImage(redirectUrl));
            return;
          }
        }
        
        if (res.statusCode !== 200) {
          console.warn(`Failed to download ${url}: ${res.statusCode}`);
          res.resume();
          resolve(null);
          return;
        }
        
        const out = fs.createWriteStream(target);
        res.pipe(out);
        
        out.on('finish', () => {
          out.close(() => resolve(target));
        });
        
        out.on('error', (err) => {
          console.warn(`Error writing ${url}:`, err);
          try { fs.unlinkSync(target); } catch {}
          resolve(null);
        });
      }).on('error', (err) => {
        console.warn(`Error downloading ${url}:`, err);
        resolve(null);
      });
    } catch (err) {
      console.warn(`Error processing ${url}:`, err);
      resolve(null);
    }
  });
}

// Download all images with rate limiting and retry logic
async function downloadAll() {
  const urls = Array.from(imageUrls);
  let downloaded = 0;
  let skipped = 0;
  let failed = 0;
  const failedUrls: string[] = [];
  
  console.log('Downloading images...');
  
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    process.stdout.write(`\rProgress: ${i + 1}/${urls.length} (Downloaded: ${downloaded}, Skipped: ${skipped}, Failed: ${failed})`);
    
    const fname = Buffer.from(url).toString('base64') + '.webp';
    const target = path.join(imageDir, fname);
    
    if (fs.existsSync(target) && fs.statSync(target).size > 0) {
      skipped++;
      continue;
    }
    
    const result = await downloadImage(url);
    if (result) {
      downloaded++;
    } else {
      failed++;
      failedUrls.push(url);
    }
    
    // Small delay to avoid overwhelming the server
    if (i < urls.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  
  console.log(`\n\nInitial download complete!`);
  console.log(`Downloaded: ${downloaded}`);
  console.log(`Skipped (already exists): ${skipped}`);
  console.log(`Failed: ${failed}`);
  
  // Retry failed downloads up to 3 times
  if (failedUrls.length > 0) {
    const maxRetries = 3;
    for (let retry = 1; retry <= maxRetries; retry++) {
      if (failedUrls.length === 0) break;
      
      console.log(`\n\n--- Retry attempt ${retry}/${maxRetries} for ${failedUrls.length} failed images ---`);
      const stillFailed: string[] = [];
      let retryDownloaded = 0;
      
      for (let i = 0; i < failedUrls.length; i++) {
        const url = failedUrls[i];
        process.stdout.write(`\rRetry ${retry}: ${i + 1}/${failedUrls.length} (Downloaded: ${retryDownloaded}, Still failed: ${stillFailed.length})`);
        
        const fname = Buffer.from(url).toString('base64') + '.webp';
        const target = path.join(imageDir, fname);
        
        // Check if somehow got downloaded
        if (fs.existsSync(target) && fs.statSync(target).size > 0) {
          retryDownloaded++;
          continue;
        }
        
        const result = await downloadImage(url);
        if (result) {
          retryDownloaded++;
          downloaded++;
          failed--;
        } else {
          stillFailed.push(url);
        }
        
        // Longer delay on retries
        if (i < failedUrls.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      console.log(`\nRetry ${retry} complete: ${retryDownloaded} recovered`);
      failedUrls.length = 0;
      failedUrls.push(...stillFailed);
    }
  }
  
  console.log(`\n\n=== FINAL SUMMARY ===`);
  console.log(`Total downloaded: ${downloaded}`);
  console.log(`Skipped (already exists): ${skipped}`);
  console.log(`Final failed count: ${failed}`);
  console.log(`Total images available: ${downloaded + skipped}`);
  console.log(`Images saved to: ${imageDir}`);
  
  if (failedUrls.length > 0) {
    console.log(`\n--- Failed URLs (${failedUrls.length}) ---`);
    failedUrls.forEach(url => console.log(`  - ${url}`));
  }
}

downloadAll().catch(console.error);
