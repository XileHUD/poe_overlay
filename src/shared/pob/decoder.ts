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
 * Only allows fetching from trusted pobb.in domain
 */
async function fetchPobbinCode(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    // Validate URL is from pobb.in only
    try {
      const urlObj = new URL(url);
      if (urlObj.hostname !== 'pobb.in') {
        console.error('[PoB Decoder] Invalid hostname, only pobb.in allowed:', urlObj.hostname);
        resolve(null);
        return;
      }
    } catch (error) {
      console.error('[PoB Decoder] Invalid URL:', error);
      resolve(null);
      return;
    }
    
    https.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        // Extract PoB code from textarea in HTML
        const match = data.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/);
        if (match && match[1]) {
          console.log('[PoB Decoder] Successfully extracted code from pobb.in (length:', match[1].trim().length, ')');
          resolve(match[1].trim());
        } else {
          console.error('[PoB Decoder] Could not find PoB code in pobb.in response');
          console.error('[PoB Decoder] Response preview:', data.substring(0, 500));
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
    
    // Security: Limit input size to prevent DoS (10MB limit)
    if (base64Code.length > 10 * 1024 * 1024) {
      console.error('[PoB Decoder] Input too large, max 10MB');
      return null;
    }
    
    // Handle pobb.in URLs - fetch the actual code
    if (base64Code.match(/^https?:\/\/pobb\.in\//i)) {
      console.log('[PoB Decoder] Detected pobb.in URL, fetching...', base64Code);
      const fetchedCode = await fetchPobbinCode(base64Code);
      if (!fetchedCode) {
        console.error('[PoB Decoder] Failed to fetch code from pobb.in');
        return null;
      }
      base64Code = fetchedCode;
      console.log('[PoB Decoder] Fetched code length:', base64Code.length);
      
      // Validate fetched code length as well
      if (base64Code.length > 10 * 1024 * 1024) {
        console.error('[PoB Decoder] Fetched code too large, max 10MB');
        return null;
      }
    }
    
    // Remove other URL prefixes if present (pastebin, etc)
    base64Code = base64Code.replace(/^https?:\/\/[^\/]+\//, '');
    
    console.log('[PoB Decoder] Decoding base64 (length:', base64Code.length, ')');
    
    // Decode Base64
    const compressed = Buffer.from(base64Code, 'base64');
    
    console.log('[PoB Decoder] Decompressing (compressed size:', compressed.length, ')');
    
    // Decompress with Zlib
    const decompressed = zlib.inflateSync(compressed);
    
    console.log('[PoB Decoder] Decompressed size:', decompressed.length);
    
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
