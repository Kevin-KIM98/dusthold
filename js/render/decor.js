// 꾸미기 전용 (게임 규칙과 무관): 얼룩진 잔디 바닥 · 풀 포기 · 꽃 · 자갈 · 지평선 언덕.
// 랜덤 대신 좌표 해시를 써서 항상 같은 모습 (시드·Math.random 불필요).
import * as THREE from 'three';
import { distToPolyline } from '../sim/collision.js';
import { bakeParts, vcMaterial } from './merge.js';

/** 좌표 → 0~1 고정 난수 */
export function hash2(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
/** 부드러운 값 노이즈 0~1 */
export function noise2(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

const GRASS_A = new THREE.Color(0x6aa548), GRASS_B = new THREE.Color(0x4f8a3a), GRASS_C = new THREE.Color(0x8fb85a);
const TRODDEN = new THREE.Color(0x9aa760);
const _c = new THREE.Color();

/** 꼭짓점 색으로 얼룩진 잔디 바닥. 성벽 안쪽은 살짝 밟힌 색 */
export function buildGrassGround(scene, map, wallsHalf) {
  const size = map.halfSize * 2;
  const seg = 72;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg).rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const n = noise2(x * 0.12, z * 0.12) * 0.7 + noise2(x * 0.45, z * 0.45) * 0.3;
    _c.copy(GRASS_B).lerp(GRASS_A, n);
    if (noise2(x * 0.3 + 40, z * 0.3) > 0.72) _c.lerp(GRASS_C, 0.5); // 밝은 풀밭 얼룩
    const inside = Math.max(Math.abs(x), Math.abs(z));
    if (inside < wallsHalf) _c.lerp(TRODDEN, 0.25 * (1 - inside / wallsHalf) + 0.1);
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  ground.receiveShadow = true;
  scene.add(ground);

  // 맵 바깥: 어두운 숲 바닥 + 지평선 언덕
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(size * 5, size * 5).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: 0x3f6b30 }));
  outer.position.y = -0.03;
  scene.add(outer);
  const hills = [];
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2 + hash2(i, 3) * 0.2;
    const r = map.halfSize + 10 + hash2(i, 7) * 14;
    const s = 7 + hash2(i, 11) * 9;
    const g = new THREE.IcosahedronGeometry(1, 1).scale(s, s * (0.35 + hash2(i, 5) * 0.25), s).translate(Math.cos(a) * r, -s * 0.12, Math.sin(a) * r);
    hills.push({ geo: g, color: hash2(i, 9) > 0.5 ? 0x4a7d36 : 0x557f3b, flat: true });
  }
  const hm = new THREE.Mesh(bakeParts(hills), vcMaterial(true));
  scene.add(hm);
}

/** 풀 포기·꽃·자갈: 길·성채·패드·성벽 줄·나무를 피해 흩뿌림 (InstancedMesh 3개) */
export function buildScatter(scene, state, balance) {
  const map = balance.map, W = balance.walls.half;
  const blade = (rx, ry) => new THREE.ConeGeometry(0.07, 0.42, 4).translate(0, 0.21, 0).rotateZ(rx).rotateX(ry);
  const tuftGeo = bakeParts([
    { geo: blade(0, 0), color: 0x7cba52 }, { geo: blade(0.4, 0.2).translate(0.08, 0, 0), color: 0x8cc85e },
    { geo: blade(-0.4, -0.2).translate(-0.08, 0, 0.03), color: 0x74b04c }, { geo: blade(0.1, -0.45).translate(0, 0, -0.08), color: 0x96cf66 },
  ]);
  const flowerGeo = bakeParts([
    { geo: new THREE.CylinderGeometry(0.015, 0.015, 0.3, 3).translate(0, 0.15, 0), color: 0x4f8a3a },
    { geo: new THREE.IcosahedronGeometry(0.08, 0).translate(0, 0.32, 0), color: 0xffffff },
  ]);
  const pebbleGeo = new THREE.DodecahedronGeometry(0.14, 0).scale(1, 0.55, 1).translate(0, 0.04, 0);
  const free = (x, z, margin) => {
    if (Math.abs(x) > map.halfSize - 1 || Math.abs(z) > map.halfSize - 1) return false;
    const k = state.castle;
    if (Math.abs(x - k.x) < k.halfWidth + 1 && Math.abs(z - k.z) < k.halfDepth + 1) return false;
    if (Math.abs(Math.max(Math.abs(x), Math.abs(z)) - W) < 0.9) return false; // 성벽 줄
    for (const p of state.pads) if (Math.abs(x - p.x) < p.half + 0.6 && Math.abs(z - p.z) < p.half + 0.6) return false;
    for (const p of state.paths) if (distToPolyline(x, z, p.points) < p.width / 2 + margin) return false;
    for (const o of state.obstacles) if (Math.hypot(x - o.x, z - o.z) < o.r + 0.3) return false;
    return true;
  };
  const make = (geo, mat, count, pick, colorOf, name) => {
    const m = new THREE.InstancedMesh(geo, mat, count);
    const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    let n = 0;
    for (let i = 0; n < count && i < count * 6; i++) {
      const p = pick(i);
      if (!p) continue;
      _q.setFromAxisAngle(up, hash2(i, 77) * Math.PI * 2);
      const sc = 0.7 + hash2(i, 91) * 0.7;
      _p.set(p[0], 0, p[1]); _s.set(sc, sc, sc);
      m.setMatrixAt(n, _m.compose(_p, _q, _s));
      if (colorOf) m.setColorAt(n, colorOf(i));
      n++;
    }
    m.count = n; m.name = name; m.receiveShadow = true;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    scene.add(m);
    return m;
  };
  const span = map.halfSize - 1;
  // 풀 포기: 노이즈가 높은 곳에 무리 지어
  make(tuftGeo, vcMaterial(), 480, i => {
    const x = (hash2(i, 1) * 2 - 1) * span, z = (hash2(i, 2) * 2 - 1) * span;
    return noise2(x * 0.2, z * 0.2) > 0.5 && free(x, z, 0.3) ? [x, z] : null;
  }, null, 'tufts');
  // 꽃: 흰·노랑·분홍·보라
  const petals = [0xffffff, 0xffe066, 0xff9ec4, 0xb9a0ff].map(c => new THREE.Color(c));
  make(flowerGeo, vcMaterial(), 220, i => {
    const x = (hash2(i, 13) * 2 - 1) * span, z = (hash2(i, 14) * 2 - 1) * span;
    return noise2(x * 0.15 + 9, z * 0.15) > 0.55 && free(x, z, 0.5) ? [x, z] : null;
  }, i => petals[Math.floor(hash2(i, 15) * petals.length)], 'flowers');
  // 자갈: 길 가장자리에
  make(pebbleGeo, new THREE.MeshLambertMaterial({ color: 0xa59a88, flatShading: true }), 160, i => {
    const p = state.paths[i % state.paths.length];
    const t = hash2(i, 21), seg = Math.floor(t * (p.points.length - 1)), u = t * (p.points.length - 1) - seg;
    const [ax, az] = p.points[seg], [bx, bz] = p.points[seg + 1];
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz) || 1;
    const side = (hash2(i, 22) > 0.5 ? 1 : -1) * (p.width / 2 + 0.15 + hash2(i, 23) * 0.5);
    const x = ax + dx * u - dz / len * side, z = az + dz * u + dx / len * side;
    return free(x, z, 0) || distToPolyline(x, z, p.points) >= p.width / 2 ? [x, z] : null;
  }, i => new THREE.Color().setHSL(0.08, 0.1, 0.5 + hash2(i, 24) * 0.25), 'pebbles');
}
