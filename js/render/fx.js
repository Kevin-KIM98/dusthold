// 파티클·공사 연출. 연출용이라 Math.random 허용 (시뮬레이션에는 영향 없음).
// 객체 풀: 최대 MAX_PARTICLES개. 넘치면 가장 오래된 것을 다시 쓴다.
import { CONFIG } from '../config.js';

const MAX = CONFIG.FX.MAX_PARTICLES;

export function createFx() {
  const pool = [];
  for (let k = 0; k < MAX; k++) pool.push({ alive: false, x: 0, y: 0, vx: 0, vy: 0, g: 0, life: 0, max: 1, size: 2, color: '#fff', born: 0 });
  let clock = 0;

  const fx = {
    pool,
    /** 월드 좌표 (x, y) */
    spawn(x, y, vx, vy, life, color, size, gravity) {
      let p = pool.find((q) => !q.alive);
      if (!p) p = pool.reduce((a, b) => (a.born <= b.born ? a : b)); // 가장 오래된 것
      p.alive = true;
      p.x = x; p.y = y; p.vx = vx; p.vy = vy;
      p.life = life; p.max = life; p.color = color; p.size = size; p.g = gravity || 0;
      p.born = clock++;
      return p;
    },
    count() {
      let n = 0;
      for (const p of pool) if (p.alive) n++;
      return n;
    },
    /** 흙 파편 */
    dirt(x, y) {
      fx.spawn(x, y, (Math.random() - 0.5) * 60, -30 - Math.random() * 50, 0.6 + Math.random() * 0.4, Math.random() < 0.5 ? '#8a6a48' : '#5e452f', 2 + Math.random() * 2.5, 160);
    },
    /** 평균 expected개(소수 가능)만큼 흙 파편을 x, 세로 yTop~yTop+h 사이에서 뿌린다 */
    emitDirt(x, yTop, h, expected) {
      const n = Math.floor(expected) + (Math.random() < expected % 1 ? 1 : 0);
      for (let k = 0; k < n; k++) fx.dirt(x, yTop + h * Math.random());
      return n;
    },
    /** 완공 반짝 */
    sparkle(x, y, w, h, n) {
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 20 + Math.random() * 50;
        fx.spawn(x + Math.random() * w, y + Math.random() * h, Math.cos(a) * sp, Math.sin(a) * sp, 0.7 + Math.random() * 0.5, Math.random() < 0.5 ? '#ffe680' : '#ffffff', 2 + Math.random() * 2, 0);
      }
    },
    update(dt) {
      for (const p of pool) {
        if (!p.alive) continue;
        p.life -= dt;
        if (p.life <= 0) { p.alive = false; continue; }
        p.vy += p.g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
    },
    /** toScreen(x, y) → {x, y}, scale = 줌 */
    draw(ctx, toScreen, scale) {
      for (const p of pool) {
        if (!p.alive) continue;
        const s = toScreen(p.x, p.y);
        ctx.globalAlpha = Math.max(0, p.life / p.max);
        ctx.fillStyle = p.color;
        const r = p.size * scale;
        ctx.fillRect(s.x - r / 2, s.y - r / 2, r, r);
      }
      ctx.globalAlpha = 1;
    },
    clear() {
      for (const p of pool) p.alive = false;
    },
  };
  return fx;
}
