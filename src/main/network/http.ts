import { net } from 'electron';

export interface HttpResponse { statusCode: number; headers: Record<string,string>; body: string }

export function httpGetRaw(url: string, headers?: Record<string,string>, timeoutMs: number = 10000): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    try {
      const request = net.request({ method: 'GET', url, useSessionCookies: true });
      if (headers) {
        for (const [k, v] of Object.entries(headers)) request.setHeader(k, v);
      }
      const resHeaders: Record<string,string> = {};
      const chunks: Buffer[] = [];
      const timer = setTimeout(() => {
        try { request.abort(); } catch {}
        reject(new Error(`Request timeout after ${timeoutMs}ms`));
      }, timeoutMs);
      request.on('response', (response) => {
        const statusCode = response.statusCode || 0;
        for (const [k, v] of Object.entries(response.headers)) {
          const val = Array.isArray(v) ? v.join(', ') : (v ?? '').toString();
            resHeaders[k.toLowerCase()] = val;
        }
        response.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        response.on('end', () => {
          clearTimeout(timer);
          resolve({ statusCode, headers: resHeaders, body: Buffer.concat(chunks).toString('utf8') });
        });
      });
      request.on('error', (err) => reject(err));
      request.end();
    } catch (e) {
      reject(e);
    }
  });
}

export async function httpGetText(url: string, headers?: Record<string,string>): Promise<string> {
  const { body } = await httpGetRaw(url, headers, 12000);
  return body;
}
