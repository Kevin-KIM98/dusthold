// 타이틀 화면 배경: 이미 있는 그림(방·흙·문·크레인·생존자·좀비)으로 그린 벙커 단면 한 장.
// 이미지가 없으면 도형으로 (CLAUDE.md 아트 규칙). 움직이지 않는 그림이라 열릴 때·크기 바뀔 때·그림을 불러왔을 때만 다시 그린다.
import { CONFIG } from '../config.js';
import { drawSprite, drawSpriteFeet, drawSpritePart, tileSprite, hasSprite } from './sprites.js';
import { PAL, drawPerson, cellRect } from './bunkerView.js';
import { drawZombie } from './zombieArt.js';
import { ZOMBIE_H } from './surfaceView.js';

const T = CONFIG.TITLE_SCENE;
const V = CONFIG.BUNKER_VIEW;
const ROOMS = CONFIG.BUNKER.ROOMS;

/** canvas(CSS 크기 w×h)에 장면을 그린다 */
export function drawTitleScene(canvas) {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  const dpr = Math.min(T.MAX_DPR, window.devicePixelRatio || 1);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  const k = w / T.WORLD_W;                 // 월드 1px → 화면 px
  const hy = h * T.HORIZON;                // 지표면(화면 y)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // 하늘: 해 질 녘 (위 어둡게 → 지평선 주황빛)
  const sky = ctx.createLinearGradient(0, 0, 0, hy);
  sky.addColorStop(0, '#0f1418');
  sky.addColorStop(0.55, '#24303a');
  sky.addColorStop(0.85, '#6a4a3a');
  sky.addColorStop(1, '#c0784a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, hy);
  // 지평선에 반쯤 걸린 해 (먼지에 번진 빛)
  const sx = w * T.SUN.x, sr = w * T.SUN.r;
  const glow = ctx.createRadialGradient(sx, hy, sr * 0.2, sx, hy, sr * 3);
  glow.addColorStop(0, 'rgba(255,190,110,0.55)');
  glow.addColorStop(1, 'rgba(255,150,90,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, hy);
  ctx.fillStyle = 'rgba(255,200,130,0.85)';
  ctx.beginPath(); ctx.arc(sx, hy, sr * 0.55, Math.PI, 0); ctx.fill();

  // 월드 좌표계: x = 0..WORLD_W, 지표면 = V.SKY_H (벙커 화면과 같은 배치)
  ctx.save();
  ctx.translate(0, hy - V.SKY_H * k);
  ctx.scale(k, k);
  const worldH = (h - hy) / k + V.SKY_H;
  // 흙
  if (!tileSprite(ctx, 'soil.top', 0, V.SKY_H, T.WORLD_W, worldH, V.SOIL_TILE, V.SOIL_TILE)) {
    ctx.fillStyle = PAL.soil;
    ctx.fillRect(0, V.SKY_H, T.WORLD_W, worldH - V.SKY_H);
  }
  // 풀 띠
  if (hasSprite('ground.strip')) {
    for (let x = 0; x < T.WORLD_W; x += V.STRIP_W) drawSpritePart(ctx, 'ground.strip', 0, 0.27, 1, 0.55, x, V.SKY_H - V.GRASS_H - 8, V.STRIP_W + 0.5, V.GRASS_H + 16);
  } else {
    ctx.fillStyle = PAL.grass;
    ctx.fillRect(0, V.SKY_H - V.GRASS_H, T.WORLD_W, V.GRASS_H);
  }
  // 방
  let id = 1;
  for (const [floor, col, type, spec] of T.ROOMS) {
    const r = cellRect(floor, col);
    const rw = r.w * ROOMS[type].w;
    if (!drawSprite(ctx, 'room.' + type, r.x + 1, r.y + 1, rw - 2, r.h - 2)) {
      ctx.fillStyle = PAL.rooms[type];
      ctx.fillRect(r.x + 2, r.y + 3, rw - 4, r.h - 6);
    }
    if (spec) drawPerson(ctx, r.x + rw / 2, r.y + r.h - 8, 1, { id: id++, specialty: spec, hp: CONFIG.SURVIVOR.HP }, 0);
  }
  // 방폭문 + 크레인 + 포탑
  const sc = cellRect(1, CONFIG.BUNKER.SHAFT_COL);
  const door = { x: sc.x + 4, y: V.SKY_H - V.GRASS_H - 30, w: sc.w - 8, h: 30 };
  if (!drawSprite(ctx, 'door.side', door.x - 6, door.y - 8, door.w + 12, door.h + 8)) {
    ctx.fillStyle = PAL.doorDark;
    ctx.fillRect(door.x - 4, door.y - 4, door.w + 8, door.h + 4);
    ctx.fillStyle = PAL.door;
    ctx.fillRect(door.x, door.y, door.w, door.h);
  }
  drawSpriteFeet(ctx, 'turret', door.x - 10, V.SKY_H - V.GRASS_H + 2, 18, true);
  drawSpriteFeet(ctx, 'crane', door.x + door.w + 70, V.SKY_H - V.GRASS_H + 2, 92, true);
  // 좀비 (왼쪽에서 문 쪽으로)
  const feet = V.SKY_H - V.GRASS_H + 2;
  for (const [x, type] of T.ZOMBIES) {
    if (!drawSpriteFeet(ctx, 'zombie.' + type, x, feet, ZOMBIE_H[type], false)) drawZombie(ctx, x, feet, 1, type, 1, 0, 1);
  }
  ctx.restore();

  // 아래쪽은 버튼이 잘 보이게 어둡게, 위쪽 제목 뒤도 살짝
  const shade = ctx.createLinearGradient(0, hy, 0, h);
  shade.addColorStop(0, 'rgba(10,12,14,0)');
  shade.addColorStop(0.45, 'rgba(10,12,14,0.55)');
  shade.addColorStop(1, 'rgba(10,12,14,0.92)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, hy, w, h - hy);
}
