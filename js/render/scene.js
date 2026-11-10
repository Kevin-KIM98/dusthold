// 3D 장면: 바닥·길·성채·나무·바위·성주. 모두 단순 도형과 색 (M1~M5 규칙).
// sim 상태는 읽기만 한다.
import * as THREE from 'three';
import { makeInstanced } from './instanced.js';
import { createCoinView } from './coins.js';
import { createPadView } from './pads.js';
import { createBuildingView } from './buildings.js';
import { createFx } from './fx.js';
import { createUnitView } from './units.js';
import { createWallView } from './walls.js';
import { createGuideView } from './guide.js';
import { createCampView } from './camps.js';
import { bakeParts, bakeGroup, vcMaterial } from './merge.js';
import { buildGrassGround, buildScatter, hash2 } from './decor.js';
import { swordAngle, SWORD_IDLE } from './anim.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3();

const COLORS = {
  sky: 0xa9d3e6, path: 0xd9bd86, pathEdge: 0xa88a5e,
  stone: 0xdcdad3, stoneDark: 0xbdbab1, stoneDeep: 0x9c9990, roof: 0x4f9be0, roofDark: 0x3a7fc4,
  gate: 0x4a3524, window: 0x2b2a33, banner: 0x4a8fd8, gold: 0xf2c23e,
  trunk: 0x6b4a2f, pine: 0x2f6e3a, pine2: 0x3f8746, leafRound: 0x4f9a3e, leafRound2: 0x66ad4a, rock: 0x9a958c, rock2: 0x86827a,
  wool: 0xf5f1e6, woolShade: 0xe3ddcf, sheepFace: 0x3a3330, hoof: 0x24201d, horn: 0xdcb45a,
  tunic: 0x2f5fa8, cape: 0xb8332c, belt: 0x6b4423, skin: 0xedc099, helm: 0xc9cfd6, plume: 0xd8402f, saddle: 0x9c2f2a,
};

// 화면에서 잘 보이도록 모델만 키움 (충돌 반지름은 sim의 commander.radius)
const COMMANDER_SCALE = 1.25;

/** art = loadAssets() 결과 (없으면 전부 도형) */
export function createScene(state, balance, canvas, art = { models: {}, textures: {} }) {
  const rcfg = balance.render;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, rcfg.maxPixelRatio));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // 색이 너무 바래지 않는 톤 매핑 + 살짝 밝게
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.sky);
  scene.fog = new THREE.Fog(COLORS.sky, 60, 120);

  scene.add(new THREE.HemisphereLight(0xd6ecff, 0x5a6a3c, 1.25));
  const sun = new THREE.DirectionalLight(0xffe4bd, 2.4); // 따뜻한 오후 햇빛
  sun.castShadow = true;
  sun.shadow.mapSize.set(rcfg.shadowMapSize, rcfg.shadowMapSize);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -rcfg.shadowRange;
  sc.right = sc.top = rcfg.shadowRange;
  sc.near = 1; sc.far = 80;
  sun.shadow.bias = -0.0005;
  const sunOffset = new THREE.Vector3(-14, 30, 10);
  scene.add(sun, sun.target);

  buildGround(scene, balance, art);
  buildPaths(scene, state.paths, art, balance.render.art.pathTileMeters);
  buildCastle(scene, state.castle, art);
  buildObstacles(scene, state.obstacles, art);
  buildScatter(scene, state, balance);
  const commander = buildCommander(art);
  scene.add(commander);
  const coinView = createCoinView(scene, balance);
  const padView = createPadView(scene, state);
  const buildingView = createBuildingView(scene, art);
  const fx = createFx(scene, balance);
  const unitView = createUnitView(scene, balance, art);
  const wallView = createWallView(scene, balance);
  const guideView = createGuideView(scene, balance);
  const campView = createCampView(scene);

  const attack = { yaw: 0, start: -1e9 };
  let lastNow = 0;
  let faceYaw = state.commander.angle;
  const sword = commander.getObjectByName('sword');
  // sim 이벤트 → 날아가는 은화 연출
  function playEvents(st, events) {
    let payN = 0, pickN = 0;
    for (const e of events) {
      if (e.type === 'pickup') {
        const n = Math.min(e.n || 1, 8); // 더미를 주우면 몇 개만 날아가는 연출
        for (let i = 0; i < n; i++) {
          _a.set(e.x, 0.3, e.z);
          fx.fly(_a, coinView.stackTop(commander, st.commander.coins - n + i, _b), pickN++ * 0.03);
        }
      } else if (e.type === 'pay') {
        const pad = st.pads.find(p => p.id === e.padId);
        for (let i = 0; i < e.n; i++) {
          coinView.stackTop(commander, st.commander.coins + i, _a);
          _b.set(pad.x, 0.1, pad.z);
          fx.fly(_a, _b, payN++ * 0.03);
        }
      } else if (e.type === 'shot') {
        fx.shoot(e.x, e.z, e.tx, e.tz, e.from === 'tower' ? balance.towers.platformHeight + 1.0 : 1.0);
      } else if (e.type === 'enemyDown') {
        fx.puff(e.x, e.z, e.enemy === 'giant' ? 2.5 : 1);
        fx.burst(e.x, e.z, e.enemy === 'giant' ? 14 : e.enemy === 'shield' ? 4 : 2); // 은화 폭발 연출
      } else if (e.type === 'campCaptured') {
        fx.puff(e.x, e.z, 3);
        fx.burst(e.x, e.z, 40);
      } else if (e.type === 'archerDown' || e.type === 'commanderDown') {
        fx.puff(e.x, e.z, 0.8);
      } else if (e.type === 'wallDown') {
        fx.puff(e.x, e.z, 2);
      } else if (e.type === 'smash') {
        fx.puff(e.x, e.z, 1.5);
      } else if (e.type === 'throw') {
        attack.yaw = Math.atan2(e.tx - e.x, e.tz - e.z);
        attack.start = lastNow;
        fx.throwAxe(commander.position.x, commander.position.z, e.tx, e.tz);
      } else if (e.type === 'slash') {
        // 성주가 적 쪽으로 몸을 돌리고 칼을 휘두름 + 칼바람
        attack.yaw = Math.atan2(e.tx - e.x, e.tz - e.z);
        attack.start = lastNow;
        fx.slash(commander.position.x, commander.position.z, attack.yaw);
      } else if (e.type === 'taxCollect') {
        const n = Math.min(e.n, 15);
        for (let i = 0; i < n; i++) {
          _a.set(e.x, 0.9, e.z);
          fx.fly(_a, coinView.stackTop(commander, st.commander.coins - n + i, _b), i * 0.03);
        }
      }
    }
  }

  return {
    renderer, scene, sun,
    setFog(near, far) { scene.fog.near = near; scene.fog.far = far; },
    /** alpha = 틱 사이 보간 비율(0~1) */
    sync(st, alpha, focus, events, now, dt, camera) {
      const c = st.commander;
      commander.position.set(lerp(c.prevX, c.x, alpha), 0, lerp(c.prevZ, c.z, alpha));
      // 공격 연출은 게임 시간 기준 (?fast 배속에서도 휘두르기가 끝까지 보이도록)
      const gameNow = st.time + alpha * balance.sim.tickSeconds;
      lastNow = gameNow;
      // 싸우는 동안(마지막 공격 후 공격 간격 + 조금)은 적 쪽을, 아니면 걷는 방향을 본다. 부드럽게 돈다 (연출만)
      const fighting = gameNow - attack.start < balance.commander.attackInterval + 0.25;
      const want = fighting ? attack.yaw : lerpAngle(c.prevAngle, c.angle, alpha);
      faceYaw = lerpAngle(faceYaw, want, Math.min(1, dt * 14));
      commander.rotation.y = faceYaw;
      const su = (gameNow - attack.start) / balance.render.slashSeconds;
      if (sword) sword.rotation.x = swordAngle(su);
      // 걷는 동안 살짝 통통 튀기
      const bob = c.moving ? Math.abs(Math.sin(st.time * 12)) * 0.08 : 0;
      commander.children[0].position.y = bob;
      commander.visible = c.alive;
      sun.position.set(focus.x, 0, focus.z).add(sunOffset);
      sun.target.position.set(focus.x, 0, focus.z);
      buildingView.sync(st, now);
      campView.sync(st);
      wallView.sync(st);
      padView.sync(st, now);
      coinView.sync(st, commander, now);
      unitView.sync(st, alpha, now, camera, commander.position);
      guideView.sync(st, commander.position, now);
      if (events.length) playEvents(st, events);
      fx.update(dt);
    },
    commanderObject: commander,
  };
}

function buildGround(scene, balance, art) {
  const g = art.textures.grass;
  buildGrassGround(scene, balance.map, balance.walls.half, g ? g.texture : null, balance.render.art.grassTileMeters * (g ? g.repeat : 1));
}

function buildPaths(scene, paths, art, tileM = 3) {
  const mat = art.textures.path
    ? new THREE.MeshLambertMaterial({ map: art.textures.path.texture, side: THREE.DoubleSide, color: 0xf4ead8 })
    : new THREE.MeshLambertMaterial({ color: COLORS.path, side: THREE.DoubleSide });
  const uvScale = art.textures.path ? 1 / (4 * art.textures.path.repeat) : 0.25; // 아래 UV 계산에서 ×4 → repeat 반영
  const edgeMat = new THREE.MeshLambertMaterial({ color: COLORS.pathEdge, side: THREE.DoubleSide });
  // 가장자리 띠를 먼저(조금 넓고 낮게), 그 위에 길
  for (const [list, m, y] of [[paths.map(p => ({ ...p, width: p.width + 1.0 })), edgeMat, 0.008], [paths, mat, 0.016]]) for (const p of list) {
    const pos = [];
    const idx = [];
    // 선분마다 사각형 + 꺾이는 점마다 원 → 하나의 지오메트리
    const addQuad = (a, b) => {
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len * p.width / 2, nz = dx / len * p.width / 2;
      const i = pos.length / 3;
      pos.push(a[0] + nx, 0, a[1] + nz, a[0] - nx, 0, a[1] - nz, b[0] - nx, 0, b[1] - nz, b[0] + nx, 0, b[1] + nz);
      idx.push(i, i + 2, i + 1, i, i + 3, i + 2);
    };
    const addDisc = (c) => {
      const seg = 12, i0 = pos.length / 3;
      pos.push(c[0], 0, c[1]);
      for (let k = 0; k <= seg; k++) {
        const a = (k / seg) * Math.PI * 2;
        pos.push(c[0] + Math.cos(a) * p.width / 2, 0, c[1] + Math.sin(a) * p.width / 2);
      }
      for (let k = 1; k <= seg; k++) idx.push(i0, i0 + k + 1, i0 + k);
    };
    for (let i = 0; i + 1 < p.points.length; i++) addQuad(p.points[i], p.points[i + 1]);
    for (const pt of p.points) addDisc(pt);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    // UV: u = 길을 따라 간 거리, v = 길 가운데서 옆으로 떨어진 거리 (가장 가까운 선분 기준)
    const cum = [0];
    for (let i = 1; i < p.points.length; i++) cum.push(cum[i - 1] + Math.hypot(p.points[i][0] - p.points[i - 1][0], p.points[i][1] - p.points[i - 1][1]));
    const uv = [];
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i], z = pos[i + 2];
      let best = Infinity, along = 0, across = 0;
      for (let k = 0; k + 1 < p.points.length; k++) {
        const [ax, az] = p.points[k], [bx, bz] = p.points[k + 1];
        const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz) || 1;
        const t = Math.max(0, Math.min(len, ((x - ax) * dx + (z - az) * dz) / len));
        const px = ax + dx / len * t, pz = az + dz / len * t, d = Math.hypot(x - px, z - pz);
        if (d < best - 1e-6) { best = d; along = cum[k] + t; across = ((x - ax) * dz - (z - az) * dx) / len; }
      }
      uv.push(along / tileM * uvScale * 4, 0.5 + across / tileM * uvScale * 4);
    }
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    // 아래를 향한 면이 있어도 보이도록 법선을 위로 고정
    const n = g.attributes.normal;
    for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
    const mesh = new THREE.Mesh(g, m);
    mesh.position.y = y;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
}

function buildCastle(scene, castle, art) {
  const g = new THREE.Group();
  g.position.set(castle.x, 0, castle.z);
  if (art.models.castle) {
    const m = new THREE.Mesh(art.models.castle.geometry, art.models.castle.material);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    scene.add(g);
    return;
  }
  const M = c => new THREE.MeshLambertMaterial({ color: c });
  const add = (geo, color, x, y, z, ry = 0) => { const m = new THREE.Mesh(geo, M(color)); m.position.set(x, y, z); m.rotation.y = ry; g.add(m); return m; };
  const w = castle.halfWidth, d = castle.halfDepth;
  const merlons = (cx, cz, half, y, color) => { // 사각형 둘레 총안
    const n = Math.max(3, Math.round(half * 2 / 0.6));
    for (let i = 0; i < n; i++) {
      const u = -half + (i + 0.5) * (half * 2 / n);
      if (i % 2) continue;
      for (const [x, z] of [[u, -half], [u, half], [-half, u], [half, u]]) add(new THREE.BoxGeometry(0.32, 0.35, 0.32), color, cx + x, y, cz + z);
    }
  };
  // 받침돌
  add(new THREE.BoxGeometry(w * 2 + 0.2, 0.4, d * 2 + 0.2), COLORS.stoneDeep, 0, 0.2, 0);
  // 본관 + 위 총안
  const kw = w * 0.78, kd = d * 0.78;
  add(new THREE.BoxGeometry(kw * 2, 3.4, kd * 2), COLORS.stone, 0, 2.1, 0);
  add(new THREE.BoxGeometry(kw * 2 + 0.2, 0.2, kd * 2 + 0.2), COLORS.stoneDark, 0, 3.85, 0);
  merlons(0, 0, kw, 4.12, COLORS.stoneDark);
  // 가운데 높은 탑 + 파란 지붕 + 금색 깃발
  add(new THREE.CylinderGeometry(1.0, 1.1, 2.4, 10), COLORS.stone, 0, 5.0, 0);
  add(new THREE.ConeGeometry(1.35, 1.9, 10), COLORS.roof, 0, 7.15, 0);
  add(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 5), COLORS.stoneDeep, 0, 8.6, 0);
  add(new THREE.BoxGeometry(0.85, 0.48, 0.04), COLORS.gold, 0.43, 8.95, 0);
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; add(new THREE.BoxGeometry(0.22, 0.5, 0.06), COLORS.window, Math.cos(a) * 1.02, 5.2, Math.sin(a) * 1.02, -a + Math.PI / 2); }
  // 네 모서리 탑
  const tr = Math.min(w, d) * 0.3;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const tx = sx * (w - tr), tz = sz * (d - tr);
    add(new THREE.CylinderGeometry(tr, tr * 1.12, 4.8, 10), COLORS.stoneDark, tx, 2.6, tz);
    add(new THREE.CylinderGeometry(tr * 1.18, tr * 1.18, 0.35, 10), COLORS.stoneDeep, tx, 5.1, tz);
    add(new THREE.ConeGeometry(tr * 1.3, 1.7, 10), COLORS.roof, tx, 6.1, tz);
    add(new THREE.BoxGeometry(0.14, 0.45, 0.06), COLORS.window, tx + sx * 0.0, 3.4, tz + sz * tr * 1.02);
  }
  // 창문 (본관 네 면)
  for (const u of [-1, 1]) {
    add(new THREE.BoxGeometry(0.34, 0.6, 0.06), COLORS.window, u * kw * 0.5, 2.9, kd + 0.03);
    add(new THREE.BoxGeometry(0.34, 0.6, 0.06), COLORS.window, u * kw * 0.5, 2.9, -kd - 0.03);
    add(new THREE.BoxGeometry(0.06, 0.6, 0.34), COLORS.window, kw + 0.03, 2.9, u * kd * 0.5);
    add(new THREE.BoxGeometry(0.06, 0.6, 0.34), COLORS.window, -kw - 0.03, 2.9, u * kd * 0.5);
  }
  // 성문 (남쪽 +z): 돌 테두리 + 둥근 나무 문
  add(new THREE.BoxGeometry(1.9, 2.3, 0.18), COLORS.stoneDeep, 0, 1.35, kd + 0.05);
  add(new THREE.BoxGeometry(1.3, 1.5, 0.2), COLORS.gate, 0, 1.15, kd + 0.08);
  const arch = new THREE.CylinderGeometry(0.65, 0.65, 0.2, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2);
  add(arch, COLORS.gate, 0, 1.9, kd + 0.08);
  // 파란 깃발 두 장 (문 양옆)
  for (const u of [-1, 1]) {
    add(new THREE.BoxGeometry(0.55, 1.5, 0.05), COLORS.banner, u * 1.35, 2.6, kd + 0.04);
    add(new THREE.BoxGeometry(0.55, 0.12, 0.06), COLORS.gold, u * 1.35, 2.2, kd + 0.05);
    add(new THREE.BoxGeometry(0.12, 0.12, 0.06), COLORS.gold, u * 1.35, 2.75, kd + 0.05);
  }
  scene.add(bakeGroup(g).group);
}

function buildObstacles(scene, obstacles, art) {
  const cliffs = obstacles.filter(o => o.kind === 'cliff');
  if (cliffs.length) {
    // 절벽: 키 큰 바위를 촘촘히 세워 벽처럼 (꼭대기는 풀)
    const cliffGeo = bakeParts([
      { geo: new THREE.DodecahedronGeometry(1, 0).scale(1.25, 2.4, 1.25).translate(0, 1.5, 0), color: 0x8f8a80, flat: true },
      { geo: new THREE.DodecahedronGeometry(0.9, 0).scale(1.1, 0.35, 1.1).translate(0, 3.6, 0), color: 0x5f8f44, flat: true },
    ]);
    const items = cliffs.map(o => ({ x: o.x, z: o.z, rot: o.rot, sx: o.r / 1.3, sy: 0.85 + hash2(o.x, o.z) * 0.4, sz: o.r / 1.3 }));
    const cm = makeInstanced(cliffGeo, vcMaterial(true), items, { receiveShadow: true });
    cm.name = 'cliffs';
    scene.add(cm);
  }
  const trees = obstacles.filter(o => o.kind === 'tree');
  const rocks = obstacles.filter(o => o.kind === 'rock');
  const tItems = trees.map(t => ({ x: t.x, z: t.z, rot: t.rot, sx: t.scale, sy: t.scale, sz: t.scale }));
  const rItems0 = rocks.map(r => ({ x: r.x, z: r.z, rot: r.rot, sx: r.scale, sy: r.scale, sz: r.scale }));
  const tm = art.models.tree, rm = art.models.rock;
  if (tm) scene.add(makeInstanced(tm.geometry, tm.material, tItems));
  if (rm) scene.add(makeInstanced(rm.geometry, rm.material, rItems0, { receiveShadow: true }));
  if (tm && rm) return;

  const trunk = () => new THREE.CylinderGeometry(0.16, 0.24, 1.2, 6).translate(0, 0.6, 0);
  const pineGeo = bakeParts([
    { geo: trunk(), color: COLORS.trunk },
    { geo: new THREE.ConeGeometry(1.05, 1.5, 7).translate(0, 1.6, 0), color: COLORS.pine, flat: true },
    { geo: new THREE.ConeGeometry(0.82, 1.3, 7).translate(0, 2.35, 0), color: COLORS.pine2, flat: true },
    { geo: new THREE.ConeGeometry(0.55, 1.0, 7).translate(0, 3.05, 0), color: COLORS.pine2, flat: true },
  ]);
  const roundGeo = bakeParts([
    { geo: trunk(), color: COLORS.trunk },
    { geo: new THREE.IcosahedronGeometry(1.0, 0).scale(1, 0.9, 1).translate(0, 1.95, 0), color: COLORS.leafRound, flat: true },
    { geo: new THREE.IcosahedronGeometry(0.62, 0).translate(0.45, 2.55, 0.2), color: COLORS.leafRound2, flat: true },
    { geo: new THREE.IcosahedronGeometry(0.55, 0).translate(-0.5, 2.35, -0.25), color: COLORS.leafRound2, flat: true },
  ]);
  const tint = (mesh, list, seedK) => {
    const c = new THREE.Color();
    list.forEach((o, i) => { const v = 0.85 + hash2(o.x * 3.1, o.z * 1.7 + seedK) * 0.3; mesh.setColorAt(i, c.setRGB(v, v * (0.95 + hash2(o.z, o.x) * 0.1), v)); });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };
  if (!tm) {
    const isPine = t => hash2(t.x * 0.37, t.z * 0.53) < 0.55;
    const pines = trees.filter(isPine), rounds = trees.filter(t => !isPine(t));
    const itemsOf = list => list.map(t => ({ x: t.x, z: t.z, rot: t.rot, sx: t.scale, sy: t.scale, sz: t.scale }));
    const pm = makeInstanced(pineGeo, vcMaterial(true), itemsOf(pines)); tint(pm, pines, 1); scene.add(pm);
    const rmh = makeInstanced(roundGeo, vcMaterial(true), itemsOf(rounds)); tint(rmh, rounds, 2); scene.add(rmh);
  }
  if (!rm) {
    const rockGeo = bakeParts([
      { geo: new THREE.DodecahedronGeometry(1, 0).scale(1, 0.7, 1).translate(0, 0.35, 0), color: COLORS.rock, flat: true },
      { geo: new THREE.DodecahedronGeometry(0.45, 0).scale(1, 0.7, 1).translate(0.85, 0.15, 0.35), color: COLORS.rock2, flat: true },
      { geo: new THREE.DodecahedronGeometry(0.3, 0).translate(-0.6, 0.1, 0.7), color: COLORS.rock2, flat: true },
    ]);
    const rItems = rocks.map(r => ({ x: r.x, z: r.z, rot: r.rot, sx: r.r, sy: r.r, sz: r.r }));
    const mesh = makeInstanced(rockGeo, vcMaterial(true), rItems, { receiveShadow: true });
    tint(mesh, rocks, 3);
    scene.add(mesh);
  }
}

// 성주: 뿔이 말린 양을 탄 기수. +z 방향을 바라보게 만든다.
function buildCommander(art) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  if (art.models.commander) {
    const m = new THREE.Mesh(art.models.commander.geometry, art.models.commander.material);
    m.castShadow = true;
    body.add(m);
    return root; // 모델은 이미 맞춘 크기 (COMMANDER_SCALE 안 씀)
  }
  const mat = c => new THREE.MeshLambertMaterial({ color: c });
  const add = (geo, color, x, y, z) => { const mesh = new THREE.Mesh(geo, mat(color)); mesh.position.set(x, y, z); body.add(mesh); return mesh; };

  // 뿔양: 몽글몽글 털 뭉치
  add(new THREE.SphereGeometry(0.5, 12, 9), COLORS.wool, 0, 0.66, -0.05).scale.set(1.0, 0.82, 1.3);
  for (const [x, y, z, r] of [[0.28, 0.78, 0.25, 0.26], [-0.28, 0.78, 0.25, 0.26], [0.3, 0.72, -0.35, 0.27], [-0.3, 0.72, -0.35, 0.27], [0, 0.95, -0.5, 0.24], [0, 0.6, 0.48, 0.24]]) {
    add(new THREE.SphereGeometry(r, 8, 6), y > 0.75 ? COLORS.wool : COLORS.woolShade, x, y, z);
  }
  add(new THREE.SphereGeometry(0.13, 6, 5), COLORS.wool, 0, 0.75, -0.75); // 꼬리
  for (const lx of [-0.24, 0.24]) for (const lz of [-0.33, 0.3]) {
    add(new THREE.CylinderGeometry(0.07, 0.065, 0.36, 6), COLORS.sheepFace, lx, 0.22, lz);
    add(new THREE.CylinderGeometry(0.08, 0.08, 0.08, 6), COLORS.hoof, lx, 0.04, lz);
  }
  // 얼굴 + 귀 + 말린 뿔
  add(new THREE.SphereGeometry(0.2, 10, 8), COLORS.sheepFace, 0, 0.86, 0.66).scale.set(0.9, 1.0, 1.2);
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.16, 0.06, 0.08), COLORS.sheepFace, s * 0.2, 0.92, 0.58);
    const horn = add(new THREE.TorusGeometry(0.15, 0.055, 6, 12, Math.PI * 1.7), COLORS.horn, s * 0.21, 0.98, 0.58);
    horn.rotation.y = Math.PI / 2;
    horn.rotation.z = s * 0.3;
  }
  // 안장 담요
  add(new THREE.BoxGeometry(0.62, 0.06, 0.6), COLORS.saddle, 0, 1.12, -0.05);
  add(new THREE.BoxGeometry(0.66, 0.03, 0.64), COLORS.gold, 0, 1.09, -0.05);
  // 기수: 파란 옷 · 금색 띠 · 빨간 망토 · 투구와 깃털 · 작은 방패
  add(new THREE.CylinderGeometry(0.19, 0.26, 0.6, 10), COLORS.tunic, 0, 1.43, -0.05);
  add(new THREE.CylinderGeometry(0.255, 0.255, 0.07, 10), COLORS.belt, 0, 1.24, -0.05);
  for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.06, 0.06, 0.42, 6), COLORS.tunic, s * 0.25, 1.45, 0.02).rotation.z = s * 0.25;
  const cape = add(new THREE.BoxGeometry(0.46, 0.7, 0.04), COLORS.cape, 0, 1.36, -0.27);
  cape.rotation.x = 0.25;
  add(new THREE.SphereGeometry(0.18, 10, 8), COLORS.skin, 0, 1.88, -0.02);
  add(new THREE.SphereGeometry(0.2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), COLORS.helm, 0, 1.92, -0.02);
  add(new THREE.ConeGeometry(0.07, 0.38, 6), COLORS.plume, 0, 2.2, -0.08).rotation.x = -0.4;
  const shield = add(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 12), COLORS.banner, 0.34, 1.38, 0.08);
  shield.rotation.z = Math.PI / 2;
  const rim = add(new THREE.TorusGeometry(0.2, 0.025, 4, 14), COLORS.gold, 0.365, 1.38, 0.08);
  rim.rotation.y = Math.PI / 2;
  // 등 뒤 은화 받침 (은화 탑이 여기 쌓인다)
  add(new THREE.BoxGeometry(0.4, 0.08, 0.4), COLORS.belt, 0, 0.98, -0.6);
  const baked = bakeGroup(body, { receiveShadow: false });
  root.remove(body);
  root.add(baked.group);
  // 칼: 오른손(바라보는 방향 기준 오른쪽 = -x), 어깨를 축으로 휘두른다
  const sword = new THREE.Group();
  sword.name = 'sword';
  sword.position.set(-0.27, 1.5, 0.02);
  const sm = c => new THREE.MeshLambertMaterial({ color: c });
  // 빛나는 칼 (조명 영향 없이 밝게 + 바깥에 노란 빛)
  const glowBlade = new THREE.MeshBasicMaterial({ color: 0xfff4c2 });
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.95, 0.03).translate(0, 0.72, 0), glowBlade);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.18, 4).translate(0, 1.28, 0), glowBlade);
  const aura = new THREE.Mesh(new THREE.BoxGeometry(0.26, 1.2, 0.16).translate(0, 0.78, 0),
    new THREE.MeshBasicMaterial({ color: 0xffc83a, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
  aura.name = 'swordAura';
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.07).translate(0, 0.24, 0), sm(COLORS.gold));
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 6).translate(0, 0.12, 0), sm(COLORS.belt));
  for (const m of [blade, tip, guard, grip]) { m.castShadow = true; sword.add(m); }
  sword.add(aura);
  sword.rotation.x = SWORD_IDLE;
  baked.group.add(sword);
  root.scale.setScalar(COMMANDER_SCALE);
  return root;
}

function lerp(a, b, t) { return a + (b - a) * t; }
function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
