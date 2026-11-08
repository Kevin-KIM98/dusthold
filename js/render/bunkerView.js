// 벙커 단면 그리기. M1은 자리만 잡는다 (M3에서 칸·방·공사 연출).
import { t } from '../strings.js';
import { isNight } from '../sim/time.js';

const COLORS = { sky: '#6f8aa0', skyNight: '#101624', grass: '#4d7a3a', dirt: '#5a4330', dirtDark: '#3f2e21', text: 'rgba(255,255,255,0.6)', door: '#777' };
const SURFACE_Y = 0.2;

export function drawBunker(ctx, w, h, state) {
  const sy = Math.floor(h * SURFACE_Y);
  ctx.fillStyle = isNight(state) ? COLORS.skyNight : COLORS.sky;
  ctx.fillRect(0, 0, w, sy);
  ctx.fillStyle = COLORS.grass;
  ctx.fillRect(0, sy, w, 8);
  ctx.fillStyle = COLORS.dirt;
  ctx.fillRect(0, sy + 8, w, h - sy - 8);

  // 방폭문(입구) 자리
  ctx.fillStyle = COLORS.door;
  ctx.fillRect(w / 2 - 14, sy - 28, 28, 28);

  ctx.fillStyle = COLORS.text;
  ctx.font = '14px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(t('view.bunker.placeholder'), w / 2, sy + (h - sy) / 2);
}
