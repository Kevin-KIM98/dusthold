// 헤드리스 브라우저 테스트 공통: 정적 서버 + Playwright Chromium (없으면 skip)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, extname, normalize } from 'node:path';
import { ROOT } from './helpers.js';

let chromium = null;
try { chromium = createRequire(import.meta.url)('playwright').chromium; } catch { /* 없음 */ }
export const skip = chromium ? false : 'playwright 없음';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };

/** 게임 페이지를 열어 { page, ctx, errors, close } 를 돌려준다 */
export async function openGame(query = '?seed=1', viewport = { width: 390, height: 844 }) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const rel = normalize(decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)).replace(/^([/\\])+/, '');
    try {
      const body = await readFile(join(ROOT, rel));
      res.writeHead(200, { 'content-type': TYPES[extname(rel)] || 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(base + query);
  await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 20000 });
  await page.waitForTimeout(800);
  return {
    page, ctx, errors,
    async close() { await browser.close(); server.close(); },
  };
}
