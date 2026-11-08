// 이미지 스프라이트 (M6). 아틀라스가 없거나 이미지가 안 열리면 아무것도 안 하고 false를 돌려준다
// → 그리는 쪽은 false면 기존 도형 그림으로 대체한다 (CLAUDE.md 아트 규칙: 이미지가 없으면 도형).
//
// assets/atlas.js (tools/build_atlas.py가 만든다):
//   export const ATLAS = { images: { tiles: 'assets/tiles.png', ... }, sprites: { 'tile.forest': { img, x, y, w, h }, ... } }

const store = { images: {}, sprites: {}, loaded: false };
const BAR_INSET = 0.16; // 막대 홈 안쪽으로 채움을 들이는 비율 (홈 테두리 두께)

/** 시작할 때 한 번. 실패해도 조용히 끝난다 (도형으로 대체) */
export async function loadSprites(basePath = '') {
  let atlas = null;
  try {
    const mod = await import('../../assets/atlas.js');
    atlas = mod.ATLAS;
  } catch {
    return false;
  }
  if (!atlas || !atlas.images || !atlas.sprites) return false;
  const loads = Object.entries(atlas.images).map(([key, src]) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { store.images[key] = img; resolve(); };
    img.onerror = () => resolve(); // 이 이미지만 빠지고 나머지는 계속
    img.src = basePath + src;
  }));
  await Promise.all(loads);
  store.sprites = atlas.sprites;
  store.loaded = true;
  return true;
}

/** 쓸 수 있는 스프라이트인가 */
export function hasSprite(name) {
  const sp = store.sprites[name];
  return !!(sp && store.images[sp.img]);
}

/** (dx, dy)에 dw×dh 크기로 그린다. 없으면 false */
export function drawSprite(ctx, name, dx, dy, dw, dh) {
  const sp = store.sprites[name];
  if (!sp) return false;
  const img = store.images[sp.img];
  if (!img) return false;
  ctx.drawImage(img, sp.x, sp.y, sp.w, sp.h, dx, dy, dw, dh);
  return true;
}

/** 발 위치(fx, fy) 기준으로 높이 h에 맞춰 가운데 정렬해 그린다 (사람·좀비용). flip = 좌우 반전 */
export function drawSpriteFeet(ctx, name, fx, fy, h, flip) {
  const sp = store.sprites[name];
  if (!sp) return false;
  const img = store.images[sp.img];
  if (!img) return false;
  const w = (h * sp.w) / sp.h;
  if (flip) {
    ctx.save();
    ctx.translate(fx, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(img, sp.x, sp.y, sp.w, sp.h, -w / 2, fy - h, w, h);
    ctx.restore();
  } else {
    ctx.drawImage(img, sp.x, sp.y, sp.w, sp.h, fx - w / 2, fy - h, w, h);
  }
  return true;
}

/** 테스트·디버그용 */
export function spriteStats() {
  return { loaded: store.loaded, images: Object.keys(store.images).length, sprites: Object.keys(store.sprites).filter(hasSprite).length };
}

/** 스프라이트의 일부분(비율 0~1)만 잘라 그린다. 없으면 false */
export function drawSpritePart(ctx, name, fx0, fy0, fx1, fy1, dx, dy, dw, dh) {
  const sp = store.sprites[name];
  if (!sp) return false;
  const img = store.images[sp.img];
  if (!img) return false;
  ctx.drawImage(img, sp.x + sp.w * fx0, sp.y + sp.h * fy0, sp.w * (fx1 - fx0), sp.h * (fy1 - fy0), dx, dy, dw, dh);
  return true;
}

const patternCanvas = {};

/** (x0,y0)~(x1,y1) 영역을 스프라이트로 바둑판처럼 채운다 (한 칸 tw×th). 반복 패턴이라 이음새가 겹치지 않는다. 없으면 false */
export function tileSprite(ctx, name, x0, y0, x1, y1, tw, th) {
  const sp = store.sprites[name];
  if (!sp) return false;
  const img = store.images[sp.img];
  if (!img) return false;
  let c = patternCanvas[name];
  if (!c) {
    c = document.createElement('canvas');
    c.width = sp.w;
    c.height = sp.h;
    c.getContext('2d').drawImage(img, sp.x, sp.y, sp.w, sp.h, 0, 0, sp.w, sp.h);
    patternCanvas[name] = c;
  }
  const pat = ctx.createPattern(c, 'repeat');
  if (pat.setTransform && typeof DOMMatrix !== 'undefined') {
    pat.setTransform(new DOMMatrix([tw / sp.w, 0, 0, th / sp.h, 0, 0]));
  }
  ctx.fillStyle = pat;
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  return true;
}

/** 가로로 늘리는 3조각 그림: 양 끝(둥근 머리)은 비율 그대로, 가운데만 늘린다. 폭이 좁으면 끝도 같이 줄인다 */
export function drawSprite3(ctx, name, x, y, w, h) {
  const sp = store.sprites[name];
  if (!sp || w <= 0) return false;
  const img = store.images[sp.img];
  if (!img) return false;
  const capS = sp.h / 2;
  const capD = Math.min(h / 2, w / 2);
  ctx.drawImage(img, sp.x, sp.y, capS, sp.h, x, y, capD, h);
  if (w > capD * 2) ctx.drawImage(img, sp.x + capS, sp.y, sp.w - capS * 2, sp.h, x + capD, y, w - capD * 2, h);
  ctx.drawImage(img, sp.x + sp.w - capS, sp.y, capS, sp.h, x + w - capD, y, capD, h);
  return true;
}

/** 이미지 막대 (화면 다듬기 7): 홈 + 진행만큼 채움. fill = 'ui.barFill' | 'ui.barGreen' | 'ui.barYellow' | 'ui.barRed'. 그림이 없으면 false */
export function drawBarSprite(ctx, x, y, w, h, p, fill) {
  if (!hasSprite('ui.barTrack') || !hasSprite(fill)) return false;
  drawSprite3(ctx, 'ui.barTrack', x, y, w, h);
  const q = Math.max(0, Math.min(1, p));
  const inset = h * BAR_INSET;
  if (q > 0) drawSprite3(ctx, fill, x + inset, y + inset, (w - inset * 2) * q, h - inset * 2);
  return true;
}

/** HTML 요소 배경으로 쓰기 위한 CSS 값 (아이콘). size = 화면 px. 없으면 null */
export function spriteCss(name, size) {
  const sp = store.sprites[name];
  if (!sp) return null;
  const img = store.images[sp.img];
  if (!img) return null;
  const k = size / Math.max(sp.w, sp.h);
  return {
    backgroundImage: `url("${img.src}")`,
    backgroundPosition: `${-sp.x * k + (size - sp.w * k) / 2}px ${-sp.y * k + (size - sp.h * k) / 2}px`,
    backgroundSize: `${img.naturalWidth * k}px ${img.naturalHeight * k}px`,
  };
}
