// 브라우저 테스트용: 저장소 폴더를 정적 서버로 띄운다 (Node 기본 모듈만).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);

export function loadPlaywright() {
  try { return require('playwright'); } catch { return null; }
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

export function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent(req.url.split('?')[0]);
      const p = path.join(ROOT, url === '/' ? '/index.html' : url);
      if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(p).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}/` }));
  });
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const nextFrame = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

/** 콘솔 에러·페이지 에러·요청 실패를 모은다 */
export function collectErrors(page) {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url()));
  return errors;
}

/** 튜토리얼 힌트를 이미 본 것으로 (힌트 카드가 다른 테스트를 가리지 않게) */
export async function skipHints(ctx) {
  await ctx.addInitScript(() => {
    try { localStorage.setItem('dusthold.hints.v1', JSON.stringify(['start', 'surface', 'bunker', 'raid', 'goal'])); } catch {}
  });
}
