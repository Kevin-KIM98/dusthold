// 지상 맵 그리기 (탑다운 타일). 이미지 없이 도형만.
// 정적 타일 레이어는 오프스크린 캔버스에 한 번 그려 두고, 맵이 바뀔 때(rev)만 다시 그린다.
// 매 프레임: 캐시 붙이기 + 선택 테두리 + 원정대 + 채집 인원 + 밤 어둠.

import { CONFIG } from '../config.js';
import { isNight } from '../sim/clock.js';
import { drawNightVeil } from './ambience.js';
import { canExplore, centerIndex, tileXY, isDepleted } from '../sim/surface.js';
import { zombiePos } from '../sim/raid.js';
import { drawZombie } from './zombieArt.js';
import { drawSprite, drawSpriteFeet, drawBarSprite, hasSprite, tileSprite as fillPattern } from './sprites.js';

const C = CONFIG.CAMERA;
const PAL = {
  bg: '#0d1013',
  fog: '#1b2026', fogDot: '#252b33', fogEdge: '#8fa3b8',
  entrance: '#7a6a4c', door: '#3a3226',
  forest: '#2f5a2c', tree: '#4f8a3c', trunk: '#5a3d22',
  ruins: '#4c4c4f', wall: '#7c7d82', crack: '#2e2e31',
  farm: '#6b7a32', row: '#a8b44a',
  reservoir: '#2a5476', wave: '#7fb8e0',
  box: '#5a4a32', crate: '#c08a4a', crateLine: '#6a4622',
  camp: '#4a4a36', tent: '#d9c27a', fire: '#e8742c',
  nest: '#4a1e1e', blob: '#8a2c2c', blobEye: '#e0c060',
  base: '#3c4430', bunker: '#6c7458', star: '#e0d070',
  barren: '#4a4236', grid: 'rgba(0,0,0,0.35)', dim: 'rgba(0,0,0,0.45)',
  cleared: '#c8c8c8', select: '#ffd54f', exp: '#ffe9a8', expLine: 'rgba(255,233,168,0.6)',
  badge: '#1c2228', badgeText: '#ffffff', night: 'rgba(5,8,22,0.5)',
};

export function createSurfaceView() {
  const view = {
    camera: { cx: CONFIG.SURFACE.SIZE / 2, cy: CONFIG.SURFACE.SIZE / 2, zoom: 1 },
    cache: null,
    cacheKey: null,
    cacheState: null,
  };

  function tilePx() {
    return C.TILE_PX * view.camera.zoom;
  }

  view.worldToScreen = (wx, wy, w, h) => ({
    x: (wx - view.camera.cx) * tilePx() + w / 2,
    y: (wy - view.camera.cy) * tilePx() + h / 2,
  });

  view.screenToTile = (sx, sy, w, h, state) => {
    const n = state.surface.size;
    const wx = (sx - w / 2) / tilePx() + view.camera.cx;
    const wy = (sy - h / 2) / tilePx() + view.camera.cy;
    const x = Math.floor(wx), y = Math.floor(wy);
    if (x < 0 || y < 0 || x >= n || y >= n) return -1;
    return y * n + x;
  };

  /** 타일 중심의 화면 좌표 (테스트·연출용) */
  view.tileToScreen = (i, w, h, state) => {
    const { x, y } = tileXY(state.surface.size, i);
    return view.worldToScreen(x + 0.5, y + 0.5, w, h);
  };

  view.clamp = (state) => {
    const n = state.surface.size;
    const m = C.PAN_MARGIN_TILES;
    view.camera.cx = Math.max(-m, Math.min(n + m, view.camera.cx));
    view.camera.cy = Math.max(-m, Math.min(n + m, view.camera.cy));
    view.camera.zoom = Math.max(C.ZOOM_MIN, Math.min(C.ZOOM_MAX, view.camera.zoom));
  };

  /** 캔버스 크기가 바뀌어도 화면 위쪽 기준으로 그림이 제자리에 있게 (패널을 열어도 탭한 칸이 손가락 아래에 그대로) */
  view.onResize = (oldW, oldH, w, h) => {
    if (oldH === 0) return;
    view.camera.cy += (h - oldH) / 2 / tilePx();
    view.camera.cx += (w - oldW) / 2 / tilePx();
  };

  view.pan = (dxPx, dyPx, state) => {
    view.camera.cx -= dxPx / tilePx();
    view.camera.cy -= dyPx / tilePx();
    view.clamp(state);
  };

  /** 화면 점(sx,sy)을 고정한 채 줌 */
  view.zoomAt = (factor, sx, sy, w, h, state) => {
    const before = { x: (sx - w / 2) / tilePx() + view.camera.cx, y: (sy - h / 2) / tilePx() + view.camera.cy };
    view.camera.zoom = Math.max(C.ZOOM_MIN, Math.min(C.ZOOM_MAX, view.camera.zoom * factor));
    view.camera.cx = before.x - (sx - w / 2) / tilePx();
    view.camera.cy = before.y - (sy - h / 2) / tilePx();
    view.clamp(state);
  };

  function rebuildCache(state) {
    const n = state.surface.size;
    const px = C.TILE_PX * C.CACHE_SCALE;
    if (!view.cache) view.cache = document.createElement('canvas');
    view.cache.width = n * px;
    view.cache.height = n * px;
    const g = view.cache.getContext('2d');
    g.clearRect(0, 0, view.cache.width, view.cache.height);
    // 안개: 이음새 없는 그림을 지도 전체 기준으로 이어 깐다 (칸마다 같은 무늬 X). 그림이 없으면 칸 그림·도형
    const fogTex = hasSprite('fog.seamless') ? px * C.FOG_TEX_TILES : 0;
    state.surface.tiles.forEach((tile, i) => {
      const { x, y } = tileXY(n, i);
      if (!tile.revealed && fogTex) fillPattern(g, 'fog.seamless', x * px, y * px, (x + 1) * px, (y + 1) * px, fogTex, fogTex);
      g.save();
      g.translate(x * px, y * px);
      const explorable = tile.revealed ? false : canExplore(state, i).ok || canExplore(state, i).reason === 'reason.busy';
      if (!tile.revealed && fogTex) { if (explorable) drawExplorable(g, px); } else drawTile(g, tile, px, explorable);
      g.restore();
    });
    // 격자
    g.strokeStyle = PAL.grid;
    g.lineWidth = 2;
    g.beginPath();
    for (let k = 0; k <= n; k++) {
      g.moveTo(k * px, 0); g.lineTo(k * px, n * px);
      g.moveTo(0, k * px); g.lineTo(n * px, k * px);
    }
    g.stroke();
    view.cacheKey = state.surface.rev;
    view.cacheState = state;
  }

  view.invalidate = () => { view.cacheKey = null; };

  /** ui: { selected } */
  view.draw = (ctx, w, h, state, ui) => {
    // 맵이 바뀌었는지: rev 번호 + 밝혀진 칸 수(원정 귀환 등)
    const key = state.surface.rev;
    if (view.cacheKey !== key || view.cacheState !== state) rebuildCache(state);

    const n = state.surface.size;
    const tp = tilePx();
    ctx.fillStyle = PAL.bg;
    ctx.fillRect(0, 0, w, h);
    const o = view.worldToScreen(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(view.cache, o.x, o.y, n * tp, n * tp);

    // 채집 인원 배지
    const counts = new Map();
    for (const s of state.survivors) if (s.job === 'gather') counts.set(s.jobTile, (counts.get(s.jobTile) || 0) + 1);
    for (const [i, c] of counts) {
      const p = view.tileToScreen(i, w, h, state);
      drawBadge(ctx, p.x + tp * 0.3, p.y - tp * 0.3, Math.max(8, tp * 0.17), String(c));
    }

    // 원정대
    const center = view.tileToScreen(centerIndex(n), w, h, state);
    for (const exp of state.surface.expeditions) {
      const tgt = view.tileToScreen(exp.tile, w, h, state);
      ctx.strokeStyle = PAL.expLine;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(center.x, center.y);
      ctx.lineTo(tgt.x, tgt.y);
      ctx.stroke();
      ctx.setLineDash([]);
      const prog = 1 - exp.ticksLeft / exp.totalTicks;
      const k = prog < 0.5 ? prog * 2 : 2 - prog * 2;
      const px = center.x + (tgt.x - center.x) * k;
      const py = center.y + (tgt.y - center.y) * k;
      ctx.fillStyle = exp.kind === 'attack' ? '#ff8a6a' : PAL.exp;
      const back = prog >= 0.5; // 돌아오는 길이면 입구 쪽을 본다
      for (let m = 0; m < exp.members.length; m++) {
        const mx = px + (m - (exp.members.length - 1) / 2) * tp * 0.22;
        const sv = state.survivors.find((v) => v.id === exp.members[m]);
        const flip = (tgt.x < center.x) !== back;
        if (sv && drawSpriteFeet(ctx, `surv.${sv.specialty}.0`, mx, py + tp * 0.18, tp * 0.42, flip)) continue;
        ctx.beginPath();
        ctx.arc(mx, py, Math.max(3, tp * 0.07), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 선택 테두리
    if (ui && ui.selected >= 0) {
      const { x, y } = tileXY(n, ui.selected);
      const p = view.worldToScreen(x, y, w, h);
      ctx.strokeStyle = PAL.select;
      ctx.lineWidth = 3;
      ctx.strokeRect(p.x + 1.5, p.y + 1.5, tp - 3, tp - 3);
    }

    // 밤 어둠: 해 질 녘·새벽에 서서히 (ui.night 0..1, 없으면 밤/낮으로)
    const night = ui && ui.night !== undefined ? ui.night : (isNight(state) ? 1 : 0);
    drawNightVeil(ctx, w, h, night);

    // 1일차 가이드가 가리키는 칸 (깜빡이는 테두리, 밤 어둠 위에)
    if (ui && ui.guideTile >= 0) {
      const { x, y } = tileXY(n, ui.guideTile);
      const p = view.worldToScreen(x, y, w, h);
      drawGuideRing(ctx, p.x, p.y, tp, tp, (ui.now || 0));
    }

    // 좀비 (밤 어둠 위에 그려서 잘 보이게)
    const raid = state.raid;
    if (raid && raid.active) {
      const now = (ui && ui.now) || 0;
      const k = Math.max(0.5, tp / C.TILE_PX);
      for (const z of raid.zombies) {
        if (z.phase === 'inside') continue;
        let p = zombiePos(z);
        if (z.phase === 'door') {
          // 입구 둘레에 모여 문을 두드린다
          const a = (z.id * 2.399) % (Math.PI * 2);
          const r = 0.42 + (z.id % 3) * 0.08;
          p = { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r };
        }
        const sp = view.worldToScreen(p.x, p.y, w, h);
        const face = p.x <= n / 2 ? 1 : -1;
        if (!drawZombieSprite(ctx, sp.x, sp.y + 8 * k, k, z, face, now)) drawZombie(ctx, sp.x, sp.y + 8 * k, k, z.type, face, now + z.id * 97, z.hp / z.maxHp);
      }
    }
  };

  return view;
}

const BADGE_IMG = 1.25; // 배지 그림은 금테가 있어 글자 원보다 조금 크게
export const ZOMBIE_H = { normal: 26, runner: 24, brute: 38 }; // 줌 1에서 화면 높이(px)

/** 좀비 이미지 + 걷는 흔들림 + 체력 막대. 이미지가 없으면 false */
export function drawZombieSprite(ctx, x, y, k, z, face, now) {
  const h = ZOMBIE_H[z.type] * k;
  const bob = Math.abs(Math.sin((now + z.id * 97) / (z.type === 'runner' ? 90 : 180))) * 2 * k;
  if (!drawSpriteFeet(ctx, 'zombie.' + z.type, x, y - bob, h, face < 0)) return false;
  if (z.hp < z.maxHp && drawBarSprite(ctx, x - 8 * k, y - h - 6 * k, 16 * k, 4 * k, z.hp / z.maxHp, 'ui.barRed')) return true;
  if (z.hp < z.maxHp) {
    const bw = 14 * k;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - bw / 2, y - h - 5 * k, bw, 2.5 * k);
    ctx.fillStyle = '#e0504a';
    ctx.fillRect(x - bw / 2, y - h - 5 * k, bw * Math.max(0, z.hp / z.maxHp), 2.5 * k);
  }
  return true;
}

/** 가이드 표시: 깜빡이는 노란 테두리 */
export function drawGuideRing(ctx, x, y, w, h, now) {
  const a = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin((now / CONFIG.TUTORIAL.PULSE_MS) * Math.PI * 2));
  ctx.save();
  ctx.strokeStyle = `rgba(255,213,79,${a})`;
  ctx.lineWidth = 4;
  ctx.setLineDash([10, 6]);
  ctx.lineDashOffset = -now / 40;
  ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
  ctx.restore();
}

function drawBadge(ctx, x, y, r, text) {
  if (!drawSprite(ctx, 'ui.badge', x - r * BADGE_IMG, y - r * BADGE_IMG, r * BADGE_IMG * 2, r * BADGE_IMG * 2)) {
    ctx.fillStyle = PAL.badge;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PAL.select;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.fillStyle = PAL.badgeText;
  ctx.font = 'bold ' + Math.round(r * 1.2) + 'px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 0.5);
}

// ---------- 타일 하나 (0,0)~(s,s) ----------
/** 타일 이미지 이름 (M6). 없으면 아래 도형으로 */
function tileSprite(tile) {
  if (!tile.revealed) return 'tile.fog';
  const spent = (tile.type === 'box' || tile.type === 'camp') && tile.cleared;
  if (spent) return 'tile.barren';
  if (tile.type === 'nest' && tile.cleared) return 'tile.nestCleared';
  return 'tile.' + tile.type;
}

function drawTile(g, tile, s, explorable) {
  if (drawSprite(g, tileSprite(tile), 0, 0, s, s)) {
    if (!tile.revealed) { if (explorable) drawExplorable(g, s); return; }
    if (tile.type === 'base' && tile.cleared) drawX(g, s);
    if (isDepleted(tile)) { g.fillStyle = PAL.dim; g.fillRect(0, 0, s, s); }
    return;
  }
  if (!tile.revealed) return drawFog(g, s, explorable);
  const type = tile.type;
  const spent = (type === 'box' || type === 'camp') && tile.cleared;
  if (spent) return fill(g, s, PAL.barren);
  switch (type) {
    case 'entrance': drawEntrance(g, s); break;
    case 'forest': drawForest(g, s); break;
    case 'ruins': drawRuins(g, s); break;
    case 'farm': drawFarm(g, s); break;
    case 'reservoir': drawReservoir(g, s); break;
    case 'box': drawBox(g, s); break;
    case 'camp': drawCamp(g, s); break;
    case 'nest': drawNest(g, s, tile.cleared); break;
    case 'base': drawBase(g, s, tile.cleared); break;
    default: fill(g, s, PAL.barren);
  }
  if (isDepleted(tile)) {
    g.fillStyle = PAL.dim;
    g.fillRect(0, 0, s, s);
  }
}

function fill(g, s, color) {
  g.fillStyle = color;
  g.fillRect(0, 0, s, s);
}

function drawFog(g, s, explorable) {
  fill(g, s, PAL.fog);
  g.fillStyle = PAL.fogDot;
  for (let k = 0; k < 6; k++) {
    g.beginPath();
    g.arc(s * (0.2 + 0.13 * k), s * (0.3 + 0.4 * ((k * 37) % 7) / 7), s * 0.08, 0, Math.PI * 2);
    g.fill();
  }
  if (explorable) drawExplorable(g, s);
}

/** 탐험할 수 있는 안개 칸 표시 (점선 테두리 + 작은 다이아몬드) */
function drawExplorable(g, s) {
  g.strokeStyle = PAL.fogEdge;
  g.lineWidth = s * 0.03;
  g.setLineDash([s * 0.08, s * 0.06]);
  g.strokeRect(s * 0.12, s * 0.12, s * 0.76, s * 0.76);
  g.setLineDash([]);
  g.fillStyle = PAL.fogEdge;
  g.beginPath();
  g.moveTo(s * 0.5, s * 0.38); g.lineTo(s * 0.6, s * 0.5); g.lineTo(s * 0.5, s * 0.62); g.lineTo(s * 0.4, s * 0.5);
  g.closePath();
  g.fill();
}

function drawEntrance(g, s) {
  fill(g, s, PAL.entrance);
  g.fillStyle = PAL.door;
  g.fillRect(s * 0.25, s * 0.3, s * 0.5, s * 0.45);
  g.fillStyle = PAL.entrance;
  g.fillRect(s * 0.25, s * 0.5, s * 0.5, s * 0.04);
  g.strokeStyle = '#c9b88a';
  g.lineWidth = s * 0.04;
  g.strokeRect(s * 0.25, s * 0.3, s * 0.5, s * 0.45);
}

function tree(g, x, y, r) {
  g.fillStyle = PAL.trunk;
  g.fillRect(x - r * 0.15, y + r * 0.6, r * 0.3, r * 0.5);
  g.fillStyle = PAL.tree;
  g.beginPath();
  g.moveTo(x, y - r); g.lineTo(x + r * 0.8, y + r * 0.7); g.lineTo(x - r * 0.8, y + r * 0.7);
  g.closePath();
  g.fill();
}
function drawForest(g, s) {
  fill(g, s, PAL.forest);
  tree(g, s * 0.3, s * 0.35, s * 0.2);
  tree(g, s * 0.68, s * 0.3, s * 0.18);
  tree(g, s * 0.5, s * 0.62, s * 0.22);
}

function drawRuins(g, s) {
  fill(g, s, PAL.ruins);
  g.fillStyle = PAL.wall;
  g.fillRect(s * 0.15, s * 0.35, s * 0.3, s * 0.45);
  g.fillRect(s * 0.55, s * 0.5, s * 0.3, s * 0.3);
  g.fillStyle = PAL.crack;
  g.beginPath();
  g.moveTo(s * 0.15, s * 0.35); g.lineTo(s * 0.3, s * 0.25); g.lineTo(s * 0.45, s * 0.35);
  g.closePath();
  g.fill();
  g.fillRect(s * 0.22, s * 0.45, s * 0.08, s * 0.1);
  g.fillRect(s * 0.65, s * 0.58, s * 0.08, s * 0.08);
}

function drawFarm(g, s) {
  fill(g, s, PAL.farm);
  g.strokeStyle = PAL.row;
  g.lineWidth = s * 0.07;
  for (let k = 0; k < 4; k++) {
    const y = s * (0.2 + k * 0.2);
    g.beginPath();
    g.moveTo(s * 0.12, y); g.lineTo(s * 0.88, y);
    g.stroke();
  }
}

function drawReservoir(g, s) {
  fill(g, s, PAL.reservoir);
  g.strokeStyle = PAL.wave;
  g.lineWidth = s * 0.04;
  for (let k = 0; k < 3; k++) {
    const y = s * (0.3 + k * 0.2);
    g.beginPath();
    g.moveTo(s * 0.15, y);
    g.quadraticCurveTo(s * 0.3, y - s * 0.08, s * 0.45, y);
    g.quadraticCurveTo(s * 0.6, y + s * 0.08, s * 0.75, y);
    g.stroke();
  }
}

function drawBox(g, s) {
  fill(g, s, PAL.box);
  g.fillStyle = PAL.crate;
  g.fillRect(s * 0.28, s * 0.32, s * 0.44, s * 0.38);
  g.strokeStyle = PAL.crateLine;
  g.lineWidth = s * 0.04;
  g.strokeRect(s * 0.28, s * 0.32, s * 0.44, s * 0.38);
  g.beginPath();
  g.moveTo(s * 0.28, s * 0.32); g.lineTo(s * 0.72, s * 0.7);
  g.moveTo(s * 0.72, s * 0.32); g.lineTo(s * 0.28, s * 0.7);
  g.stroke();
}

function drawCamp(g, s) {
  fill(g, s, PAL.camp);
  g.fillStyle = PAL.tent;
  g.beginPath();
  g.moveTo(s * 0.4, s * 0.25); g.lineTo(s * 0.68, s * 0.7); g.lineTo(s * 0.12, s * 0.7);
  g.closePath();
  g.fill();
  g.fillStyle = PAL.camp;
  g.beginPath();
  g.moveTo(s * 0.4, s * 0.48); g.lineTo(s * 0.48, s * 0.7); g.lineTo(s * 0.32, s * 0.7);
  g.closePath();
  g.fill();
  g.fillStyle = PAL.fire;
  g.beginPath();
  g.moveTo(s * 0.78, s * 0.52); g.lineTo(s * 0.86, s * 0.72); g.lineTo(s * 0.7, s * 0.72);
  g.closePath();
  g.fill();
}

function drawNest(g, s, cleared) {
  fill(g, s, cleared ? PAL.barren : PAL.nest);
  g.fillStyle = cleared ? PAL.ruins : PAL.blob;
  for (const [x, y, r] of [[0.35, 0.45, 0.18], [0.6, 0.4, 0.15], [0.52, 0.65, 0.17]]) {
    g.beginPath();
    g.arc(s * x, s * y, s * r, 0, Math.PI * 2);
    g.fill();
  }
  if (cleared) {
    drawX(g, s);
  } else {
    g.fillStyle = PAL.blobEye;
    g.fillRect(s * 0.3, s * 0.42, s * 0.05, s * 0.05);
    g.fillRect(s * 0.39, s * 0.42, s * 0.05, s * 0.05);
  }
}

function drawBase(g, s, cleared) {
  fill(g, s, PAL.base);
  g.fillStyle = PAL.bunker;
  g.fillRect(s * 0.18, s * 0.45, s * 0.64, s * 0.32);
  g.beginPath();
  g.arc(s * 0.5, s * 0.45, s * 0.32, Math.PI, 0);
  g.fill();
  // 별 (5각)
  g.fillStyle = cleared ? PAL.cleared : PAL.star;
  g.beginPath();
  for (let k = 0; k < 10; k++) {
    const r = k % 2 === 0 ? s * 0.12 : s * 0.05;
    const a = -Math.PI / 2 + k * Math.PI / 5;
    const px = s * 0.5 + Math.cos(a) * r, py = s * 0.42 + Math.sin(a) * r;
    if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
  }
  g.closePath();
  g.fill();
  if (cleared) drawX(g, s);
}

function drawX(g, s) {
  g.strokeStyle = PAL.cleared;
  g.lineWidth = s * 0.05;
  g.beginPath();
  g.moveTo(s * 0.25, s * 0.25); g.lineTo(s * 0.75, s * 0.75);
  g.moveTo(s * 0.75, s * 0.25); g.lineTo(s * 0.25, s * 0.75);
  g.stroke();
}
