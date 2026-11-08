// 지상 맵 그리기. M1은 자리만 잡는다 (M2에서 타일·안개·원정대).
import { t } from '../strings.js';
import { isNight } from '../sim/time.js';

const COLORS = { sky: '#2a3a2e', ground: '#3b4a37', grid: 'rgba(255,255,255,0.05)', text: 'rgba(255,255,255,0.55)', night: 'rgba(5,8,20,0.55)' };
const GRID = 40;

export function drawSurface(ctx, w, h, state) {
  ctx.fillStyle = COLORS.ground;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = (w % GRID) / 2; x < w; x += GRID) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
  for (let y = (h % GRID) / 2; y < h; y += GRID) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
  ctx.stroke();

  // 입구 표시 (가운데 사각형)
  ctx.fillStyle = '#8a7a5a';
  ctx.fillRect(w / 2 - GRID / 2, h / 2 - GRID / 2, GRID, GRID);

  ctx.fillStyle = COLORS.text;
  ctx.font = '14px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(t('view.surface.placeholder'), w / 2, h / 2 + GRID * 1.5);

  if (isNight(state)) {
    ctx.fillStyle = COLORS.night;
    ctx.fillRect(0, 0, w, h);
  }
}
