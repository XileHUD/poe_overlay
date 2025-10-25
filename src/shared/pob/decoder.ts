/**
 * Path of Building Code Decoder
 * 
 * Format: Base64(Zlib(XML))
 * Standard PoB format used by all PoB tools
 */

import * as zlib from 'zlib';
import * as https from 'https';

/**
 * Fetch PoB code from pobb.in URL
 */
async function fetchPobbinCode(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        // Extract PoB code from textarea in HTML
        const match = data.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/);
        if (match && match[1]) {
          resolve(match[1].trim());
        } else {
          console.error('[PoB Decoder] Could not find PoB code in pobb.in response');
          resolve(null);
        }
      });
    }).on('error', (error) => {
      console.error('[PoB Decoder] Failed to fetch pobb.in:', error);
      resolve(null);
    });
  });
}

export async function decodePobCode(code: string): Promise<string | null> {
  try {
    let base64Code = code.trim();
    
    // Handle pobb.in URLs - fetch the actual code
    if (base64Code.match(/^https?:\/\/pobb\.in\//i)) {
      console.log('[PoB Decoder] Detected pobb.in URL, fetching...');
      const fetchedCode = await fetchPobbinCode(base64Code);
      if (!fetchedCode) {
        return null;
      }
      base64Code = fetchedCode;
    }
    
    // Remove other URL prefixes if present (pastebin, etc)
    base64Code = base64Code.replace(/^https?:\/\/[^\/]+\//, '');
    
    // Decode Base64
    const compressed = Buffer.from(base64Code, 'base64');
    
    // Decompress with Zlib
    const decompressed = zlib.inflateSync(compressed);
    
    // Convert to UTF-8 string
    return decompressed.toString('utf-8');
  } catch (error) {
    console.error('[PoB Decoder] Failed to decode:', error);
    return null;
  }
}

export function encodePobCode(xml: string): string | null {
  try {
    // Compress with Zlib
    const compressed = zlib.deflateSync(Buffer.from(xml, 'utf-8'));
    
    // Encode to Base64
    return compressed.toString('base64');
  } catch (error) {
    console.error('[PoB Encoder] Failed to encode:', error);
    return null;
  }
}
