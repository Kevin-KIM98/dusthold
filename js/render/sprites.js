// 이미지 스프라이트 (M6). 아틀라스가 없거나 이미지가 안 열리면 아무것도 안 하고 false를 돌려준다
// → 그리는 쪽은 false면 기존 도형 그림으로 대체한다 (CLAUDE.md 아트 규칙: 이미지가 없으면 도형).
//
// assets/atlas.js (tools/build_atlas.py가 만든다):
//   export const ATLAS = { images: { tiles: 'assets/tiles.png', ... }, sprites: { 'tile.forest': { img, x, y, w, h }, ... } }

const store = { images: {}, sprites: {}, loaded: false };

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
