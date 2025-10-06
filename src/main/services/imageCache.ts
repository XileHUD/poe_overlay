import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

export interface ImageCacheState {
  map: Record<string,string>;
  indexPath: string | null;
}

export class ImageCacheService {
  state: ImageCacheState = { map: {}, indexPath: null };

  init(): void {
    try {
      const dir = path.join(app.getPath('userData'), 'image-cache');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      this.state.indexPath = path.join(app.getPath('userData'), 'image-cache-index.json');
      if (fs.existsSync(this.state.indexPath)) {
        try { const raw = JSON.parse(fs.readFileSync(this.state.indexPath, 'utf8')); if (raw && typeof raw === 'object') this.state.map = raw; } catch {}
      }
    } catch {}
  }

  persist(): void {
    try { if (this.state.indexPath) fs.writeFileSync(this.state.indexPath, JSON.stringify(this.state.map)); } catch {}
  }

  async download(url: string): Promise<string | null> {
    return new Promise(resolve => {
      try {
        if (!this.state.indexPath) this.init();
        const cacheDir = path.join(app.getPath('userData'), 'image-cache');
        const fname = Buffer.from(url).toString('base64').replace(/[/+=]/g,'') + path.extname(new URL(url).pathname || '.img');
        const target = path.join(cacheDir, fname || 'img.bin');
        if (fs.existsSync(target) && fs.statSync(target).size > 0) { resolve(target); return; }
        const mod = url.startsWith('https://') ? require('https') : require('http');
        const file = fs.createWriteStream(target);
        const req = mod.get(url, (res: any) => {
          if (res.statusCode !== 200) { try { file.close(); fs.unlinkSync(target); } catch {}; resolve(null); return; }
          res.pipe(file);
          file.on('finish', () => { file.close(); resolve(target); });
        });
        req.on('error', () => { try { file.close(); fs.unlinkSync(target); } catch {}; resolve(null); });
      } catch { resolve(null); }
    });
  }
}
