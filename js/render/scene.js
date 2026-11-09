// 3D 장면: 바닥·길·성채·나무·바위·성주. 모두 단순 도형과 색 (M1~M5 규칙).
// sim 상태는 읽기만 한다.
import * as THREE from 'three';
import { makeInstanced } from './instanced.js';
import { createCoinView } from './coins.js';
import { createPadView } from './pads.js';
import { createBuildingView } from './buildings.js';
import { createFx } from './fx.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3();

const COLORS = {
  sky: 0x9fc7d8, grass: 0x6f9e4c, grassDark: 0x4d7536, path: 0xcfb07a,
  stone: 0xb9b2a4, stoneDark: 0x8d867a, roof: 0x3f6aa8, gate: 0x4a3524,
  trunk: 0x6b4a2f, leaf: 0x3e7a3a, leaf2: 0x4f9145, rock: 0x8f8c86,
  wool: 0xf2eee4, sheepFace: 0x3a3330, horn: 0xd9b45a, tunic: 0xa8362f,
  skin: 0xe8b98f, helm: 0x9aa3ad, flag: 0xe0b23c,
};

// 화면에서 잘 보이도록 모델만 키움 (충돌 반지름은 sim의 commander.radius)
const COMMANDER_SCALE = 1.25;

export function createScene(state, balance, canvas) {
  const rcfg = balance.render;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, rcfg.maxPixelRatio));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.sky);
  scene.fog = new THREE.Fog(COLORS.sky, 60, 120);

  scene.add(new THREE.HemisphereLight(0xdfefff, 0x4a5a3a, 1.1));
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(rcfg.shadowMapSize, rcfg.shadowMapSize);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -rcfg.shadowRange;
  sc.right = sc.top = rcfg.shadowRange;
  sc.near = 1; sc.far = 80;
  sun.shadow.bias = -0.0005;
  const sunOffset = new THREE.Vector3(-14, 30, 10);
  scene.add(sun, sun.target);

  buildGround(scene, balance.map);
  buildPaths(scene, state.paths);
  buildCastle(scene, state.castle);
  buildObstacles(scene, state.obstacles);
  const commander = buildCommander();
  scene.add(commander);
  const coinView = createCoinView(scene, balance);
  const padView = createPadView(scene, state);
  const buildingView = createBuildingView(scene);
  const fx = createFx(scene, balance);

  // sim 이벤트 → 날아가는 은화 연출
  function playEvents(st, events) {
    let payN = 0, pickN = 0;
    for (const e of events) {
      if (e.type === 'pickup') {
        _a.set(e.x, 0.3, e.z);
        fx.fly(_a, coinView.stackTop(commander, st.commander.coins, _b), pickN++ * 0.03);
      } else if (e.type === 'pay') {
        const pad = st.pads.find(p => p.id === e.padId);
        for (let i = 0; i < e.n; i++) {
          coinView.stackTop(commander, st.commander.coins + i, _a);
          _b.set(pad.x, 0.1, pad.z);
          fx.fly(_a, _b, payN++ * 0.03);
        }
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
    sync(st, alpha, focus, events, now, dt) {
      const c = st.commander;
      commander.position.set(lerp(c.prevX, c.x, alpha), 0, lerp(c.prevZ, c.z, alpha));
      commander.rotation.y = lerpAngle(c.prevAngle, c.angle, alpha);
      // 걷는 동안 살짝 통통 튀기
      const bob = c.moving ? Math.abs(Math.sin(st.time * 12)) * 0.08 : 0;
      commander.children[0].position.y = bob;
      sun.position.set(focus.x, 0, focus.z).add(sunOffset);
      sun.target.position.set(focus.x, 0, focus.z);
      buildingView.sync(st, now);
      padView.sync(st, now);
      coinView.sync(st, commander, now);
      if (events.length) playEvents(st, events);
      fx.update(dt);
    },
    commanderObject: commander,
  };
}

function buildGround(scene, map) {
  const size = map.halfSize * 2;
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(size * 4, size * 4),
    new THREE.MeshLambertMaterial({ color: COLORS.grassDark }));
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -0.02;
  scene.add(outer);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size),
    new THREE.MeshLambertMaterial({ color: COLORS.grass }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
}

function buildPaths(scene, paths) {
  const mat = new THREE.MeshLambertMaterial({ color: COLORS.path, side: THREE.DoubleSide });
  for (const p of paths) {
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
    g.setIndex(idx);
    g.computeVertexNormals();
    // 아래를 향한 면이 있어도 보이도록 법선을 위로 고정
    const n = g.attributes.normal;
    for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
    const mesh = new THREE.Mesh(g, mat);
    mesh.position.y = 0.015;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
}

function buildCastle(scene, castle) {
  const g = new THREE.Group();
  g.position.set(castle.x, 0, castle.z);
  const stone = new THREE.MeshLambertMaterial({ color: COLORS.stone });
  const stoneDark = new THREE.MeshLambertMaterial({ color: COLORS.stoneDark });
  const roof = new THREE.MeshLambertMaterial({ color: COLORS.roof });
  const w = castle.halfWidth, d = castle.halfDepth;
  const add = (mesh, x, y, z) => { mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true; g.add(mesh); return mesh; };

  // 본관
  add(new THREE.Mesh(new THREE.BoxGeometry(w * 1.5, 3.2, d * 1.5), stone), 0, 1.6, 0);
  add(new THREE.Mesh(new THREE.ConeGeometry(w * 1.05, 2.2, 4), roof), 0, 4.3, 0).rotation.y = Math.PI / 4;
  // 네 모서리 탑
  const tr = Math.min(w, d) * 0.3;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const tx = sx * (w - tr), tz = sz * (d - tr);
    add(new THREE.Mesh(new THREE.CylinderGeometry(tr, tr * 1.1, 4.4, 8), stoneDark), tx, 2.2, tz);
    add(new THREE.Mesh(new THREE.ConeGeometry(tr * 1.3, 1.6, 8), roof), tx, 5.2, tz);
  }
  // 성문 (남쪽 +z 면)
  add(new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.8, 0.2), new THREE.MeshLambertMaterial({ color: COLORS.gate })), 0, 0.9, d * 0.75 + 0.1);
  // 깃발
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6), stoneDark), 0, 6.1, 0);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.04), new THREE.MeshLambertMaterial({ color: COLORS.flag })), 0.45, 6.6, 0);
  scene.add(g);
}

function buildObstacles(scene, obstacles) {
  const trees = obstacles.filter(o => o.kind === 'tree');
  const rocks = obstacles.filter(o => o.kind === 'rock');

  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.25, 1.2, 6);
  trunkGeo.translate(0, 0.6, 0);
  const crownGeo = new THREE.ConeGeometry(1.0, 1.8, 7);
  crownGeo.translate(0, 1.9, 0);
  const crownTopGeo = new THREE.ConeGeometry(0.7, 1.3, 7);
  crownTopGeo.translate(0, 2.8, 0);
  const items = trees.map(t => ({ x: t.x, z: t.z, rot: t.rot, sx: t.scale, sy: t.scale, sz: t.scale }));
  scene.add(makeInstanced(trunkGeo, new THREE.MeshLambertMaterial({ color: COLORS.trunk }), items));
  scene.add(makeInstanced(crownGeo, new THREE.MeshLambertMaterial({ color: COLORS.leaf, flatShading: true }), items));
  scene.add(makeInstanced(crownTopGeo, new THREE.MeshLambertMaterial({ color: COLORS.leaf2, flatShading: true }), items));

  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  rockGeo.scale(1, 0.7, 1);
  rockGeo.translate(0, 0.35, 0);
  const rItems = rocks.map(r => ({ x: r.x, z: r.z, rot: r.rot, sx: r.r, sy: r.r, sz: r.r }));
  scene.add(makeInstanced(rockGeo, new THREE.MeshLambertMaterial({ color: COLORS.rock, flatShading: true }), rItems, { receiveShadow: true }));
}

// 성주: 뿔이 말린 양을 탄 기수. +z 방향을 바라보게 만든다.
function buildCommander() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const mat = c => new THREE.MeshLambertMaterial({ color: c });
  const add = (geo, m, x, y, z) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); mesh.castShadow = true; body.add(mesh); return mesh; };

  const wool = add(new THREE.SphereGeometry(0.5, 10, 8), mat(COLORS.wool), 0, 0.62, -0.05);
  wool.scale.set(1.0, 0.85, 1.35);
  const legMat = mat(COLORS.sheepFace);
  for (const lx of [-0.25, 0.25]) for (const lz of [-0.35, 0.3]) add(new THREE.CylinderGeometry(0.07, 0.07, 0.4, 5), legMat, lx, 0.2, lz);
  add(new THREE.BoxGeometry(0.34, 0.34, 0.42), legMat, 0, 0.82, 0.62);
  const hornGeo = new THREE.TorusGeometry(0.14, 0.05, 5, 10, Math.PI * 1.6);
  const hornMat = mat(COLORS.horn);
  for (const s of [-1, 1]) {
    const h = add(hornGeo, hornMat, s * 0.22, 0.9, 0.55);
    h.rotation.y = Math.PI / 2;
  }
  // 기수
  add(new THREE.CylinderGeometry(0.2, 0.26, 0.6, 8), mat(COLORS.tunic), 0, 1.25, -0.05);
  add(new THREE.SphereGeometry(0.19, 10, 8), mat(COLORS.skin), 0, 1.7, -0.02);
  add(new THREE.ConeGeometry(0.22, 0.32, 8), mat(COLORS.helm), 0, 1.92, -0.02);
  // 등 뒤 안장 받침 (은화 탑이 여기 쌓인다)
  add(new THREE.BoxGeometry(0.4, 0.08, 0.4), mat(COLORS.gate), 0, 0.98, -0.6);
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
