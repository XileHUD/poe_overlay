import { promises as fsp } from 'fs';

export type JsonLoader<T> = (raw: string) => T;

interface CacheEntry<T> {
  data: T;
  mtimeMs: number;
}

const defaultLoader: JsonLoader<any> = (raw: string) => JSON.parse(raw);

function cloneValue<T>(value: T): T {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

export interface JsonCacheOptions {
  cloneResults?: boolean;
}

export interface GetOptions<T> {
  force?: boolean;
  loader?: JsonLoader<T>;
  clone?: boolean;
}

export class JsonCache {
  private readonly entries = new Map<string, CacheEntry<any>>();
  private readonly inflight = new Map<string, Promise<any>>();
  private readonly cloneResults: boolean;

  constructor(options: JsonCacheOptions = {}) {
    this.cloneResults = Boolean(options.cloneResults);
  }

  clear(filePath?: string): void {
    if (filePath) {
      this.entries.delete(filePath);
      return;
    }
    this.entries.clear();
  }

  async get<T = unknown>(filePath: string, options: GetOptions<T> = {}): Promise<T> {
    const { force = false } = options;
    const loader = options.loader ?? (defaultLoader as JsonLoader<T>);
    const shouldClone = options.clone ?? this.cloneResults;

    if (force) {
      this.entries.delete(filePath);
    } else {
      const cached = this.entries.get(filePath);
      if (cached) {
        try {
          const stats = await fsp.stat(filePath);
          if (stats.mtimeMs === cached.mtimeMs) {
            return shouldClone ? cloneValue<T>(cached.data) : cached.data;
          }
        } catch (err: any) {
          if (err && err.code !== 'ENOENT') {
            throw err;
          }
          // File removed - drop cache and fall through to reload
          this.entries.delete(filePath);
        }
      }
    }

    if (this.inflight.has(filePath)) {
      const result = await this.inflight.get(filePath)!;
      return shouldClone ? cloneValue<T>(result) : result;
    }

    const loadPromise = (async () => {
      const stats = await fsp.stat(filePath);
      const raw = await fsp.readFile(filePath, 'utf8');
      let parsed: T;
      try {
        parsed = loader(raw);
      } catch (err: any) {
        throw Object.assign(err instanceof Error ? err : new Error(String(err)), { filePath });
      }
      this.entries.set(filePath, { data: parsed, mtimeMs: stats.mtimeMs });
      return parsed;
    })();

    this.inflight.set(filePath, loadPromise);

    try {
      const data = await loadPromise;
      return shouldClone ? cloneValue<T>(data) : data;
    } finally {
      this.inflight.delete(filePath);
    }
  }

  async prime(filePath: string): Promise<void> {
    await this.get(filePath);
  }
}
