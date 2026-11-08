// 벙커 단면도 그리기 (옆에서 본 모습). 이미지 없이 도형만.
// 정적 레이어(하늘 아래 흙·파낸 칸 벽)는 오프스크린 캔버스에 캐시, 굴착이 끝날 때(rev)만 다시 그린다.
// 매 프레임: 방 내부·공사 단계·전선·사람·크레인·파티클.

import { CONFIG } from '../config.js';
import { t } from '../strings.js';
import { isNight } from '../sim/clock.js';
import { getBuildStage, buildersOf, workersOf, roomDef, isDug } from '../sim/bunker.js';
import { createFx } from './fx.js';

const V = CONFIG.BUNKER_VIEW;
const BK = CONFIG.BUNKER;
const C = CONFIG.CAMERA;

const PAL = {
  bg: '#0d1013', sky: '#7d9bb3', skyNight: '#121a2b', grass: '#4d7a3a', soil: '#5a4330', soilDeep: '#3f2e21', soilDot: 'rgba(0,0,0,0.18)',
  cave: '#2b2622', wall: '#1a1714', selected: '#ffd54f', cableOn: '#ffd54f', cableOff: '#5a5a5a',
  off: 'rgba(0,0,0,0.6)', bolt: '#ffd54f', boltOff: '#d0504a', label: 'rgba(255,255,255,0.85)', labelDark: 'rgba(255,255,255,0.45)',
  scaffold: '#c9a25a', frame: '#9aa0a6', bar: '#ffd54f', barBg: 'rgba(0,0,0,0.6)',
  door: '#6d7277', doorDark: '#3d4145', crane: '#e0a030',
  spec: { gather: '#6abf4b', build: '#e8913a', combat: '#e0504a', tech: '#4aa3df' },
  rooms: {
    shaft: '#3a3f44', generator: '#4a4a2a', water: '#244a5e', farm: '#2e5a2c', quarters: '#5a4a3a', storage: '#5a4e34',
    workshop: '#4e4038', guard: '#5a2e2e', medbay: '#4e5a5e', radio: '#3a3a5a',
  },
};

/** 월드 좌표(줌 1 픽셀) */
export function cellRect(floor, col) {
  return { x: V.SIDE + col * V.CELL_W, y: V.SKY_H + (floor - 1) * V.CELL_H, w: V.CELL_W, h: V.CELL_H };
}

export function worldSize() {
  return { w: V.SIDE * 2 + BK.COLS * V.CELL_W, h: V.SKY_H + BK.MAX_FLOORS * V.CELL_H + V.BOTTOM };
}

export function createBunkerView() {
  const ws = worldSize();
  const view = {
    camera: { cx: ws.w / 2, cy: 0, zoom: 1, fitted: false },
    cache: null,
    cacheKey: null,
    cacheState: null,
    figures: [],   // 마지막으로 그린 사람 위치 (화면 좌표) — 길게 눌러 잡기용
    fx: createFx(),
    drag: null,    // { id, x, y } 옮기는 중인 사람
    lastNow: 0,
  };

  const z = () => view.camera.zoom;
  view.toScreen = (wx, wy, w, h) => ({ x: (wx - view.camera.cx) * z() + w / 2, y: (wy - view.camera.cy) * z() + h / 2 });
  view.toWorld = (sx, sy, w, h) => ({ x: (sx - w / 2) / z() + view.camera.cx, y: (sy - h / 2) / z() + view.camera.cy });

  /** 처음 열 때: 폭에 맞추고 지표면이 보이게 */
  view.fit = (w, h) => {
    view.camera.zoom = Math.max(C.ZOOM_MIN, Math.min(C.ZOOM_MAX, w / ws.w));
    view.camera.cx = ws.w / 2;
    view.camera.cy = h / 2 / view.camera.zoom;
    view.camera.fitted = true;
  };

  view.clamp = (w, h) => {
    const cam = view.camera;
    cam.zoom = Math.max(C.ZOOM_MIN, Math.min(C.ZOOM_MAX, cam.zoom));
    const halfW = w / 2 / cam.zoom, halfH = h / 2 / cam.zoom;
    cam.cx = ws.w <= halfW * 2 ? ws.w / 2 : Math.max(halfW, Math.min(ws.w - halfW, cam.cx));
    cam.cy = ws.h <= halfH * 2 ? halfH : Math.max(halfH, Math.min(ws.h - halfH, cam.cy));
  };

  /** 캔버스 크기가 바뀌어도 화면 위쪽 기준으로 그림이 제자리에 있게 */
  view.onResize = (oldW, oldH, w, h) => {
    if (!view.camera.fitted || oldH === 0) return;
    view.camera.cy += (h - oldH) / 2 / z();
    view.camera.cx += (w - oldW) / 2 / z();
    view.clamp(w, h);
  };

  view.pan = (dx, dy, w, h) => {
    view.camera.cx -= dx / z();
    view.camera.cy -= dy / z();
    view.clamp(w, h);
  };

  view.zoomAt = (f, sx, sy, w, h) => {
    const before = view.toWorld(sx, sy, w, h);
    view.camera.zoom = Math.max(C.ZOOM_MIN, Math.min(C.ZOOM_MAX, view.camera.zoom * f));
    view.camera.cx = before.x - (sx - w / 2) / z();
    view.camera.cy = before.y - (sy - h / 2) / z();
    view.clamp(w, h);
  };

  /** 화면 점 → { kind: 'cell', floor, col } | { kind: 'door' } | null */
  view.hitTest = (sx, sy, w, h) => {
    const p = view.toWorld(sx, sy, w, h);
    const d = doorRect();
    if (p.x >= d.x && p.x <= d.x + d.w && p.y >= d.y && p.y <= d.y + d.h) return { kind: 'door' };
    const col = Math.floor((p.x - V.SIDE) / V.CELL_W);
    const floor = Math.floor((p.y - V.SKY_H) / V.CELL_H) + 1;
    if (col < 0 || col >= BK.COLS || floor < 1 || floor > BK.MAX_FLOORS) return null;
    return { kind: 'cell', floor, col };
  };

  /** 화면 점 근처의 사람 id (없으면 null) */
  view.figureAt = (sx, sy) => {
    let best = null, bd = V.FIGURE_HIT_PX;
    for (const f of view.figures) {
      const d = Math.hypot(f.x - sx, f.y - sy);
      if (d <= bd) { bd = d; best = f.id; }
    }
    return best;
  };

  /** 셀 중심의 화면 좌표 (테스트용) */
  view.cellToScreen = (floor, col, w, h) => {
    const r = cellRect(floor, col);
    return view.toScreen(r.x + r.w / 2, r.y + r.h / 2, w, h);
  };
  view.doorToScreen = (w, h) => {
    const d = doorRect();
    return view.toScreen(d.x + d.w / 2, d.y + d.h / 2, w, h);
  };

  /** sim 이벤트(fx.*)를 연출로 */
  view.onEvent = (e) => {
    if (e.key === 'fx.built' || e.key === 'fx.dug') {
      const r = cellRect(e.params.floor, e.params.col);
      view.fx.sparkle(r.x, r.y, r.w * e.params.w, r.h, V.SPARKLE_COUNT);
    }
  };

  function rebuildCache(state) {
    const s = V.CACHE_SCALE;
    if (!view.cache) view.cache = document.createElement('canvas');
    view.cache.width = Math.round(ws.w * s);
    view.cache.height = Math.round(ws.h * s);
    const g = view.cache.getContext('2d');
    g.setTransform(s, 0, 0, s, 0, 0);
    // 흙 (깊을수록 어둡게)
    const top = V.SKY_H;
    const grad = g.createLinearGradient(0, top, 0, ws.h);
    grad.addColorStop(0, PAL.soil);
    grad.addColorStop(1, PAL.soilDeep);
    g.fillStyle = grad;
    g.fillRect(0, top, ws.w, ws.h - top);
    // 흙 알갱이 (고정 패턴)
    g.fillStyle = PAL.soilDot;
    for (let k = 0; k < 260; k++) {
      const x = (k * 97) % ws.w, y = top + ((k * 53) % (ws.h - top));
      g.fillRect(x, y, 3, 2);
    }
    // 풀 띠
    g.fillStyle = PAL.grass;
    g.fillRect(0, top - V.GRASS_H, ws.w, V.GRASS_H);
    // 파낸 칸
    for (let f = 1; f <= BK.MAX_FLOORS; f++) {
      for (let c = 0; c < BK.COLS; c++) {
        if (!isDug(state, f, c)) continue;
        const r = cellRect(f, c);
        g.fillStyle = PAL.wall;
        g.fillRect(r.x, r.y, r.w, r.h);
        g.fillStyle = PAL.cave;
        g.fillRect(r.x + 2, r.y + 3, r.w - 4, r.h - 6);
      }
    }
    view.cacheKey = state.bunker.rev;
    view.cacheState = state;
  }

  view.invalidate = () => { view.cacheKey = null; };

  /** ui: { selected: {kind,floor,col}|null, now: ms, paused } */
  view.draw = (ctx, w, h, state, ui) => {
    if (!view.camera.fitted) view.fit(w, h);
    if (view.cacheKey !== state.bunker.rev || view.cacheState !== state) rebuildCache(state);
    const now = ui.now || 0;
    const dt = view.lastNow ? Math.min(0.1, (now - view.lastNow) / 1000) : 0;
    view.lastNow = now;
    const zz = z();
    const S = (wx, wy) => view.toScreen(wx, wy, w, h);

    ctx.fillStyle = PAL.bg;
    ctx.fillRect(0, 0, w, h);
    // 하늘
    const o = S(0, 0);
    ctx.fillStyle = isNight(state) ? PAL.skyNight : PAL.sky;
    ctx.fillRect(o.x, o.y, ws.w * zz, (V.SKY_H - V.GRASS_H) * zz);
    // 캐시
    ctx.drawImage(view.cache, o.x, o.y, ws.w * zz, ws.h * zz);

    drawSurface(ctx, state, S, zz, now);
    drawCables(ctx, state, S, zz);

    view.figures = [];
    for (const r of state.bunker.rooms) drawRoom(ctx, state, r, S, zz, now, view);
    for (const d of state.bunker.digs) drawDig(ctx, state, d, S, zz, now, view, dt, ui.paused);

    view.fx.update(dt);
    view.fx.draw(ctx, S, zz);

    // 선택
    const sel = ui.selected;
    if (sel && sel.kind === 'cell') {
      const room = state.bunker.rooms.find((r) => r.floor === sel.floor && sel.col >= r.col && sel.col < r.col + r.w);
      const r0 = cellRect(sel.floor, room ? room.col : sel.col);
      const p = S(r0.x, r0.y);
      ctx.strokeStyle = PAL.selected;
      ctx.lineWidth = 3;
      ctx.strokeRect(p.x + 1.5, p.y + 1.5, r0.w * (room ? room.w : 1) * zz - 3, r0.h * zz - 3);
    } else if (sel && sel.kind === 'door') {
      const d = doorRect();
      const p = S(d.x, d.y);
      ctx.strokeStyle = PAL.selected;
      ctx.lineWidth = 3;
      ctx.strokeRect(p.x - 2, p.y - 2, d.w * zz + 4, d.h * zz + 4);
    }

    // 옮기는 중인 사람
    if (view.drag) {
      const s = state.survivors.find((v) => v.id === view.drag.id);
      if (s) {
        if (view.drag.target) {
          const r0 = cellRect(view.drag.target.floor, view.drag.target.col);
          const p = S(r0.x, r0.y);
          ctx.strokeStyle = '#ffffff';
          ctx.setLineDash([6, 4]);
          ctx.lineWidth = 2;
          ctx.strokeRect(p.x + 2, p.y + 2, r0.w * view.drag.target.w * zz - 4, r0.h * zz - 4);
          ctx.setLineDash([]);
        }
        ctx.globalAlpha = 0.85;
        drawPerson(ctx, view.drag.x, view.drag.y + 14 * zz, zz * 1.3, s, 0);
        ctx.globalAlpha = 1;
      }
    }
  };

  return view;
}

function doorRect() {
  const r = cellRect(1, BK.SHAFT_COL);
  return { x: r.x + 4, y: V.SKY_H - V.GRASS_H - 30, w: r.w - 8, h: 30 };
}

// ---------- 지표면: 방폭문 + 크레인 ----------
function drawSurface(ctx, state, S, zz, now) {
  const d = doorRect();
  const p = S(d.x, d.y);
  ctx.fillStyle = PAL.doorDark;
  ctx.fillRect(p.x - 4 * zz, p.y - 4 * zz, (d.w + 8) * zz, (d.h + 4) * zz);
  ctx.fillStyle = PAL.door;
  ctx.fillRect(p.x, p.y, d.w * zz, d.h * zz);
  // 문 체력 줄무늬 (체력 비율만큼 밝게)
  const max = BK.DOOR_LEVELS[state.door.level - 1].hp;
  const ratio = Math.max(0, Math.min(1, state.door.hp / max));
  ctx.fillStyle = '#e0c040';
  for (let k = 0; k < 3; k++) ctx.fillRect(p.x + (6 + k * 15) * zz, p.y + 6 * zz, 8 * zz, 4 * zz);
  ctx.fillStyle = PAL.barBg;
  ctx.fillRect(p.x, p.y + (d.h - 6) * zz, d.w * zz, 4 * zz);
  ctx.fillStyle = ratio > 0.5 ? '#6abf4b' : ratio > 0.25 ? '#e0a030' : '#e0504a';
  ctx.fillRect(p.x, p.y + (d.h - 6) * zz, d.w * zz * ratio, 4 * zz);
  // 대기 중인 생존자
  for (let k = 0; k < Math.min(state.waiting.length, 4); k++) {
    drawPerson(ctx, p.x - (12 + k * 12) * zz, p.y + d.h * zz, zz * 0.9, state.waiting[k], 0);
  }
  // 공사 중이면 크레인
  const building = state.bunker.digs.length > 0 || state.bunker.rooms.some((r) => !r.done);
  if (building) {
    const base = S(d.x + d.w + 40, V.SKY_H - V.GRASS_H);
    const top = S(d.x + d.w + 40, 18);
    ctx.strokeStyle = PAL.crane;
    ctx.lineWidth = 4 * zz;
    ctx.beginPath();
    ctx.moveTo(base.x, base.y); ctx.lineTo(top.x, top.y);
    ctx.lineTo(top.x - 90 * zz, top.y);
    ctx.moveTo(top.x, top.y); ctx.lineTo(top.x + 25 * zz, top.y);
    ctx.stroke();
    // 갈지자 보강
    ctx.lineWidth = 1.5 * zz;
    ctx.beginPath();
    for (let y = base.y; y > top.y + 6 * zz; y -= 12 * zz) { ctx.moveTo(base.x - 5 * zz, y); ctx.lineTo(base.x + 5 * zz, y - 6 * zz); }
    ctx.stroke();
    // 흔들리는 갈고리
    const sway = Math.sin(now / 600) * 6 * zz;
    const hx = top.x - 70 * zz + sway, hy = top.y + 40 * zz;
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1.5 * zz;
    ctx.beginPath(); ctx.moveTo(top.x - 70 * zz, top.y); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.fillStyle = '#8a6a48';
    ctx.fillRect(hx - 8 * zz, hy, 16 * zz, 8 * zz);
  }
}

// ---------- 전선: 샤프트 세로줄 + 층마다 천장을 따라 ----------
function drawCables(ctx, state, S, zz) {
  const rows = new Map();
  for (const r of state.bunker.rooms) if (r.connected) {
    if (!rows.has(r.floor)) rows.set(r.floor, []);
    rows.get(r.floor).push(r);
  }
  ctx.lineWidth = 2.5 * zz;
  const sc = cellRect(1, BK.SHAFT_COL);
  let deepest = 0;
  for (const f of rows.keys()) deepest = Math.max(deepest, f);
  if (deepest > 0) {
    const a = S(sc.x + 8, V.SKY_H - V.GRASS_H), b = S(sc.x + 8, cellRect(deepest, 0).y + 6);
    ctx.strokeStyle = state.power.produced > 0 ? PAL.cableOn : PAL.cableOff;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  for (const [f, list] of rows) {
    for (const r of list) {
      if (r.type === 'shaft') continue;
      const rr = cellRect(f, r.col);
      const y = rr.y + 6;
      // 샤프트 쪽 끝부터 방 끝까지
      const x0 = r.col < BK.SHAFT_COL ? rr.x : rr.x;
      const x1 = rr.x + rr.w * r.w;
      const a = S(x0, y), b = S(x1, y);
      ctx.strokeStyle = r.on ? PAL.cableOn : PAL.cableOff;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      // 방과 샤프트 사이 이음
      if (r.col + r.w === BK.SHAFT_COL || r.col === BK.SHAFT_COL + 1) {
        const sx = cellRect(f, BK.SHAFT_COL);
        const c = S(sx.x + 8, y), d = S(r.col < BK.SHAFT_COL ? x1 : x0, y);
        ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.stroke();
      }
    }
  }
}

// ---------- 방 ----------
function drawRoom(ctx, state, r, S, zz, now, view) {
  const rr = cellRect(r.floor, r.col);
  const W = rr.w * r.w, H = rr.h;
  const p = S(rr.x, rr.y);
  const x = p.x, y = p.y, w = W * zz, h = H * zz;
  if (!r.done) {
    const stage = getBuildStage(r);
    ctx.fillStyle = PAL.cave;
    ctx.fillRect(x + 2 * zz, y + 3 * zz, w - 4 * zz, h - 6 * zz);
    if (stage === 'frame') drawFrame(ctx, x, y, w, h, zz, PAL.rooms[r.type]);
    drawScaffold(ctx, x, y, w, h, zz, stage === 'frame' ? 0.45 : 1);
    drawLabel(ctx, x, y, zz, t('room.' + r.type), true);
    drawBar(ctx, x, y, w, h, zz, r.progress);
    const builders = buildersOf(state, r.id);
    builders.forEach((s, k) => {
      const swing = (Math.sin(now / 500 + k * 2) + 1) / 2;
      const fx = x + (0.2 + 0.6 * swing) * w;
      const fy = y + h - 10 * zz;
      drawPerson(ctx, fx, fy, zz, s, Math.sin(now / 120 + k));
      view.figures.push({ id: s.id, x: fx, y: fy - 12 * zz });
    });
    return;
  }
  const def = roomDef(r.type);
  ctx.fillStyle = PAL.rooms[r.type];
  ctx.fillRect(x + 2 * zz, y + 3 * zz, w - 4 * zz, h - 6 * zz);
  drawFurniture(ctx, r, x, y, w, h, zz, now);
  if (r.type !== 'shaft') drawLabel(ctx, x, y, zz, t('room.' + r.type), !r.on);
  // 근무자
  const workers = workersOf(state, r.id);
  const slots = Math.max(def.workers, 1);
  workers.forEach((s, k) => {
    const fx = x + ((k + 1) / (slots + 1)) * w;
    const fy = y + h - 8 * zz;
    drawPerson(ctx, fx, fy, zz, s, r.on ? Math.sin(now / 300 + k) * 0.5 : 0);
    view.figures.push({ id: s.id, x: fx, y: fy - 12 * zz });
  });
  // 제작 진행
  if (r.craft) drawBar(ctx, x, y, w, h, zz, r.craft.progress);
  // 꺼짐 / 끊김
  if (!r.on && r.type !== 'shaft') {
    ctx.fillStyle = PAL.off;
    ctx.fillRect(x + 2 * zz, y + 3 * zz, w - 4 * zz, h - 6 * zz);
    drawBolt(ctx, x + w - 14 * zz, y + 16 * zz, 9 * zz, r.connected ? PAL.bolt : PAL.boltOff, !r.connected);
  } else if (r.on && r.type !== 'shaft' && def.use > 0) {
    // 켜진 방 천장등
    ctx.fillStyle = 'rgba(255,230,140,0.12)';
    ctx.beginPath();
    ctx.moveTo(x + w / 2 - 6 * zz, y + 8 * zz);
    ctx.lineTo(x + w / 2 + 6 * zz, y + 8 * zz);
    ctx.lineTo(x + w / 2 + 24 * zz, y + h - 4 * zz);
    ctx.lineTo(x + w / 2 - 24 * zz, y + h - 4 * zz);
    ctx.closePath();
    ctx.fill();
  }
}

function drawDig(ctx, state, d, S, zz, now, view, dt, paused) {
  const rr = cellRect(d.floor, d.col);
  const p = S(rr.x, rr.y);
  const w = rr.w * zz, h = rr.h * zz;
  // 판 만큼 흙을 걷어낸다 (왼쪽/오른쪽 중 샤프트 쪽에서부터)
  const fromLeft = d.col > BK.SHAFT_COL || (d.col === BK.SHAFT_COL);
  ctx.fillStyle = PAL.cave;
  if (d.col === BK.SHAFT_COL) ctx.fillRect(p.x + 2 * zz, p.y, w - 4 * zz, h * d.progress);
  else if (fromLeft) ctx.fillRect(p.x, p.y + 3 * zz, w * d.progress, h - 6 * zz);
  else ctx.fillRect(p.x + w * (1 - d.progress), p.y + 3 * zz, w * d.progress, h - 6 * zz);
  drawBar(ctx, p.x, p.y, w, h, zz, d.progress);
  const builders = buildersOf(state, d.id);
  builders.forEach((s, k) => {
    const fx = p.x + (fromLeft ? w * d.progress * 0.8 + 6 * zz : w * (1 - d.progress * 0.8) - 6 * zz) + k * 10 * zz * (fromLeft ? -1 : 1);
    const fy = p.y + h - 8 * zz;
    drawPerson(ctx, fx, fy, zz, s, 0);
    drawPick(ctx, fx + (fromLeft ? 6 : -6) * zz, fy - 18 * zz, zz, now + k * 200, fromLeft);
    view.figures.push({ id: s.id, x: fx, y: fy - 12 * zz });
  });
  if (builders.length > 0 && !paused && dt > 0) {
    const n = CONFIG.BUNKER_VIEW.DIG_PARTICLES_PER_SEC * dt * builders.length;
    const wx = rr.x + (fromLeft ? rr.w * d.progress : rr.w * (1 - d.progress));
    view.fx.emitDirt(wx, rr.y + rr.h * 0.4, rr.h * 0.5, n);
  }
}

// ---------- 조각 그림 ----------
function drawLabel(ctx, x, y, zz, text, dim) {
  ctx.fillStyle = dim ? PAL.labelDark : PAL.label;
  ctx.font = `${Math.max(8, Math.round(10 * zz))}px sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(text, x + 5 * zz, y + 10 * zz);
}

function drawBar(ctx, x, y, w, h, zz, p) {
  const bw = w - 12 * zz, bh = 5 * zz;
  const bx = x + 6 * zz, by = y + h - 14 * zz - 22 * zz;
  ctx.fillStyle = PAL.barBg;
  ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = PAL.bar;
  ctx.fillRect(bx, by, bw * Math.max(0, Math.min(1, p)), bh);
}

function drawScaffold(ctx, x, y, w, h, zz, alpha) {
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = PAL.scaffold;
  ctx.lineWidth = 2 * zz;
  ctx.beginPath();
  const step = 20 * zz;
  for (let px = x + 6 * zz; px <= x + w - 4 * zz; px += step) { ctx.moveTo(px, y + 4 * zz); ctx.lineTo(px, y + h - 4 * zz); }
  for (let py = y + 18 * zz; py < y + h - 4 * zz; py += 18 * zz) { ctx.moveTo(x + 4 * zz, py); ctx.lineTo(x + w - 4 * zz, py); }
  for (let px = x + 6 * zz; px + step <= x + w; px += step) { ctx.moveTo(px, y + h - 4 * zz); ctx.lineTo(px + step, y + 18 * zz); }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawFrame(ctx, x, y, w, h, zz, color) {
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.45;
  ctx.fillRect(x + 4 * zz, y + 5 * zz, w - 8 * zz, h - 10 * zz);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = PAL.frame;
  ctx.lineWidth = 3 * zz;
  ctx.strokeRect(x + 5 * zz, y + 6 * zz, w - 10 * zz, h - 12 * zz);
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y + 6 * zz); ctx.lineTo(x + w / 2, y + h - 6 * zz);
  ctx.stroke();
}

function drawBolt(ctx, cx, cy, s, color, slash) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx + 0.1 * s, cy - s); ctx.lineTo(cx - 0.6 * s, cy + 0.15 * s); ctx.lineTo(cx - 0.05 * s, cy + 0.15 * s);
  ctx.lineTo(cx - 0.2 * s, cy + s); ctx.lineTo(cx + 0.6 * s, cy - 0.2 * s); ctx.lineTo(cx + 0.05 * s, cy - 0.2 * s);
  ctx.closePath();
  ctx.fill();
  if (slash) {
    ctx.strokeStyle = color;
    ctx.lineWidth = s * 0.25;
    ctx.beginPath(); ctx.moveTo(cx - s, cy - s); ctx.lineTo(cx + s, cy + s); ctx.stroke();
  }
}

/** 발 위치 (fx, fy) 기준 사람. bob = 위아래 흔들림 */
function drawPerson(ctx, fx, fy, zz, s, bob) {
  const k = zz;
  const by = fy - (bob || 0) * 1.5 * k;
  ctx.fillStyle = PAL.spec[s.specialty] || '#ccc';
  ctx.fillRect(fx - 4 * k, by - 16 * k, 8 * k, 10 * k);   // 몸
  ctx.fillStyle = '#2a2420';
  ctx.fillRect(fx - 4 * k, by - 6 * k, 3 * k, 6 * k);     // 다리
  ctx.fillRect(fx + 1 * k, by - 6 * k, 3 * k, 6 * k);
  ctx.fillStyle = '#f0d0a8';
  ctx.beginPath(); ctx.arc(fx, by - 20 * k, 4 * k, 0, Math.PI * 2); ctx.fill(); // 머리
  if (s.hp <= CONFIG.SURVIVOR.INJURED_HP) {
    ctx.fillStyle = '#e0504a';
    ctx.fillRect(fx - 1 * k, by - 27 * k, 2 * k, 5 * k);
    ctx.fillRect(fx - 2.5 * k, by - 25.5 * k, 5 * k, 2 * k);
  }
}

function drawPick(ctx, x, y, zz, now, right) {
  const a = Math.sin(now / 130) * 0.8 + (right ? 0.3 : -0.3);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(right ? a : -a);
  ctx.strokeStyle = '#8a6a48';
  ctx.lineWidth = 2 * zz;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -12 * zz); ctx.stroke();
  ctx.strokeStyle = '#bbb';
  ctx.beginPath(); ctx.moveTo(-6 * zz, -12 * zz); ctx.quadraticCurveTo(0, -16 * zz, 6 * zz, -12 * zz); ctx.stroke();
  ctx.restore();
}

function drawFurniture(ctx, r, x, y, w, h, zz, now) {
  const k = zz;
  const floorY = y + h - 6 * k;
  switch (r.type) {
    case 'shaft': {
      ctx.strokeStyle = '#6a7076';
      ctx.lineWidth = 2 * k;
      ctx.beginPath();
      ctx.moveTo(x + 12 * k, y); ctx.lineTo(x + 12 * k, y + h);
      ctx.moveTo(x + w - 12 * k, y); ctx.lineTo(x + w - 12 * k, y + h);
      ctx.stroke();
      ctx.fillStyle = '#8a8f94';
      ctx.fillRect(x + 15 * k, y + h * 0.35, w - 30 * k, h * 0.4);
      ctx.fillStyle = '#5a5f64';
      ctx.fillRect(x + 18 * k, y + h * 0.4, w - 36 * k, h * 0.3);
      break;
    }
    case 'generator': {
      ctx.fillStyle = '#7a7a50';
      ctx.fillRect(x + w * 0.3, floorY - 28 * k, w * 0.4, 28 * k);
      ctx.fillStyle = r.on ? '#ffd54f' : '#555';
      ctx.beginPath(); ctx.arc(x + w * 0.5, floorY - 14 * k, 8 * k, 0, Math.PI * 2); ctx.fill();
      if (r.on) drawBolt(ctx, x + w * 0.5, floorY - 14 * k, 6 * k, '#4a4a2a', false);
      break;
    }
    case 'water': {
      ctx.fillStyle = '#4a7a94';
      ctx.fillRect(x + w * 0.2, floorY - 30 * k, w * 0.25, 30 * k);
      ctx.fillStyle = '#7fb8e0';
      ctx.fillRect(x + w * 0.2, floorY - 18 * k, w * 0.25, 18 * k);
      ctx.strokeStyle = '#9aa0a6';
      ctx.lineWidth = 2 * k;
      ctx.beginPath(); ctx.moveTo(x + w * 0.45, floorY - 22 * k); ctx.lineTo(x + w * 0.75, floorY - 22 * k); ctx.lineTo(x + w * 0.75, floorY - 8 * k); ctx.stroke();
      break;
    }
    case 'farm': {
      for (let i = 0; i < 4; i++) {
        const px = x + w * (0.15 + i * 0.2);
        ctx.fillStyle = '#5a3d22';
        ctx.fillRect(px - 6 * k, floorY - 6 * k, 12 * k, 6 * k);
        ctx.fillStyle = '#7ccf5a';
        ctx.beginPath(); ctx.moveTo(px, floorY - 22 * k); ctx.lineTo(px + 6 * k, floorY - 6 * k); ctx.lineTo(px - 6 * k, floorY - 6 * k); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = 'rgba(200,120,255,0.35)';
      ctx.fillRect(x + 6 * k, y + 22 * k, w - 12 * k, 3 * k);
      break;
    }
    case 'quarters': {
      for (let i = 0; i < 2; i++) {
        const bx = x + w * (0.12 + i * 0.45);
        ctx.fillStyle = '#7a6a5a';
        ctx.fillRect(bx, floorY - 26 * k, w * 0.33, 4 * k);
        ctx.fillRect(bx, floorY - 10 * k, w * 0.33, 4 * k);
        ctx.fillStyle = '#c0b090';
        ctx.fillRect(bx + 2 * k, floorY - 30 * k, 8 * k, 4 * k);
        ctx.fillRect(bx + 2 * k, floorY - 14 * k, 8 * k, 4 * k);
      }
      break;
    }
    case 'storage': {
      ctx.fillStyle = '#c08a4a';
      ctx.fillRect(x + w * 0.15, floorY - 16 * k, w * 0.35, 16 * k);
      ctx.fillRect(x + w * 0.5, floorY - 12 * k, w * 0.32, 12 * k);
      ctx.fillRect(x + w * 0.3, floorY - 28 * k, w * 0.32, 12 * k);
      break;
    }
    case 'workshop': {
      ctx.fillStyle = '#8a6a48';
      ctx.fillRect(x + w * 0.15, floorY - 16 * k, w * 0.5, 4 * k);
      ctx.fillRect(x + w * 0.18, floorY - 12 * k, 3 * k, 12 * k);
      ctx.fillRect(x + w * 0.6, floorY - 12 * k, 3 * k, 12 * k);
      ctx.save();
      ctx.translate(x + w * 0.8, floorY - 22 * k);
      if (r.on && r.craft) ctx.rotate(now / 400);
      ctx.fillStyle = '#9aa0a6';
      for (let i = 0; i < 6; i++) { ctx.rotate(Math.PI / 3); ctx.fillRect(-2 * k, -9 * k, 4 * k, 5 * k); }
      ctx.beginPath(); ctx.arc(0, 0, 5 * k, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      break;
    }
    case 'guard': {
      ctx.fillStyle = '#9aa0a6';
      ctx.beginPath();
      const cx = x + w * 0.5, cy = floorY - 26 * k;
      ctx.moveTo(cx - 10 * k, cy - 8 * k); ctx.lineTo(cx + 10 * k, cy - 8 * k); ctx.lineTo(cx + 10 * k, cy + 2 * k);
      ctx.quadraticCurveTo(cx, cy + 14 * k, cx - 10 * k, cy + 2 * k); ctx.closePath(); ctx.fill();
      break;
    }
    case 'medbay': {
      ctx.fillStyle = '#ddd';
      ctx.fillRect(x + w * 0.15, floorY - 12 * k, w * 0.4, 6 * k);
      ctx.fillStyle = '#e0504a';
      ctx.fillRect(x + w * 0.72, floorY - 34 * k, 6 * k, 18 * k);
      ctx.fillRect(x + w * 0.72 - 6 * k, floorY - 28 * k, 18 * k, 6 * k);
      break;
    }
    case 'radio': {
      ctx.fillStyle = '#6a6a8a';
      ctx.fillRect(x + w * 0.2, floorY - 20 * k, w * 0.35, 20 * k);
      ctx.fillStyle = r.on ? '#7cf07c' : '#333';
      ctx.fillRect(x + w * 0.25, floorY - 16 * k, w * 0.12, 6 * k);
      ctx.strokeStyle = '#bbb';
      ctx.lineWidth = 2 * k;
      ctx.beginPath(); ctx.moveTo(x + w * 0.7, floorY); ctx.lineTo(x + w * 0.7, y + 18 * k); ctx.stroke();
      break;
    }
    default:
  }
}
