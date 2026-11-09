// M1 로직 테스트 (브라우저 없이 Node에서)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadBalance } from './helpers.js';
import { createRng, next } from '../js/sim/rng.js';
import { createState } from '../js/sim/state.js';
import { step } from '../js/sim/rules.js';
import { distToPolyline } from '../js/sim/collision.js';
import { screenToWorld } from '../js/input/controls.js';

const B = loadBalance();
const run = (state, input, ticks) => { for (let i = 0; i < ticks; i++) step(state, input, B); };

test('시드 랜덤: 같은 시드 = 같은 수열, 다른 시드 = 다른 수열', () => {
  const a = createRng(42), b = createRng(42), c = createRng(43);
  const sa = Array.from({ length: 20 }, () => next(a));
  const sb = Array.from({ length: 20 }, () => next(b));
  const sc = Array.from({ length: 20 }, () => next(c));
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, sc);
  for (const v of sa) assert.ok(v >= 0 && v < 1);
});

test('맵 생성: 같은 시드면 나무·바위 배치가 같다', () => {
  const s1 = createState(B, 7), s2 = createState(B, 7);
  assert.deepEqual(s1.obstacles, s2.obstacles);
  assert.notDeepEqual(createState(B, 8).obstacles, s1.obstacles);
});

test('맵 생성: 나무·바위가 정해진 수만큼, 길·성채·시작 위치를 막지 않는다', () => {
  const s = createState(B, 1);
  const trees = s.obstacles.filter(o => o.kind === 'tree').length;
  const rocks = s.obstacles.filter(o => o.kind === 'rock').length;
  assert.equal(trees, B.map.trees.count);
  assert.equal(rocks, B.map.rocks.count);
  for (const o of s.obstacles) {
    for (const p of s.paths) assert.ok(distToPolyline(o.x, o.z, p.points) > p.width / 2 + o.r, '길 위에 장애물');
    assert.ok(Math.hypot(o.x - s.castle.x, o.z - s.castle.z) > 8, '성채 옆에 장애물');
    assert.ok(Math.abs(o.x) < B.map.halfSize && Math.abs(o.z) < B.map.halfSize);
  }
});

test('성주는 입력 방향으로 정해진 속도만큼 움직이고, 그 방향을 바라본다', () => {
  const s = createState(B, 1);
  const x0 = s.commander.x, z0 = s.commander.z;
  run(s, { x: 0, z: 1 }, 20); // 1초, +z(남쪽)로 — 시작점 남쪽은 길이라 열려 있음
  assert.ok(Math.abs(s.commander.z - z0 - B.commander.speed) < 1e-6, `z 이동량 ${s.commander.z - z0}`);
  assert.ok(Math.abs(s.commander.x - x0) < 1e-9);
  assert.ok(Math.abs(Math.sin(s.commander.angle)) < 1e-6 && Math.cos(s.commander.angle) > 0.999);
  const z1 = s.commander.z;
  run(s, { x: 0, z: 0 }, 10);
  assert.equal(s.commander.z, z1, '입력이 없으면 멈춘다');
  assert.equal(s.commander.moving, false);
});

test('성주는 성채를 뚫고 지나가지 못한다', () => {
  const s = createState(B, 1);
  run(s, { x: 0, z: -1 }, 200); // 시작점(성채 남쪽)에서 북쪽으로 10초간 밀기
  const c = s.commander, k = s.castle;
  assert.ok(c.z >= k.z + k.halfDepth + B.commander.radius - 1e-6, `성채 안으로 들어감 z=${c.z}`);
});

test('성주는 나무·바위를 뚫고 지나가지 못한다', () => {
  for (const kind of ['tree', 'rock']) {
    const s = createState(B, 1);
    const ob = s.obstacles.find(o => o.kind === kind);
    const c = s.commander;
    // 장애물 바로 서쪽에 세우고 동쪽(장애물 쪽)으로 3초간 민다
    c.x = c.prevX = ob.x - ob.r - B.commander.radius - 0.3;
    c.z = c.prevZ = ob.z;
    let minD = Infinity;
    for (let i = 0; i < 60; i++) {
      step(s, { x: 1, z: 0 }, B);
      minD = Math.min(minD, Math.hypot(c.x - ob.x, c.z - ob.z));
    }
    assert.ok(minD >= ob.r + B.commander.radius - 1e-6, `${kind}을(를) 통과함: 거리 ${minD}`);
  }
});

test('성주는 맵 밖으로 나가지 못한다', () => {
  const s = createState(B, 1);
  run(s, { x: 0, z: 1 }, 400);
  assert.ok(s.commander.z <= B.map.halfSize - B.commander.radius + 1e-9);
});

test('조이스틱 화면 방향 → 바닥 방향 변환 (카메라 yaw 반영)', () => {
  const yaw = B.camera.yawDeg * Math.PI / 180;
  const up = screenToWorld(0, 1, yaw);
  // 화면 위쪽 = 카메라에서 멀어지는 방향 = 카메라 위치 반대
  assert.ok(Math.abs(up.x + Math.sin(yaw)) < 1e-9 && Math.abs(up.z + Math.cos(yaw)) < 1e-9);
  const right = screenToWorld(1, 0, yaw);
  assert.ok(Math.abs(up.x * right.x + up.z * right.z) < 1e-9, '위·오른쪽이 직교');
  assert.ok(Math.abs(Math.hypot(right.x, right.z) - 1) < 1e-9);
});

test('같은 시드·같은 입력이면 같은 결과 (결정론)', () => {
  const inputs = Array.from({ length: 300 }, (_, i) => ({ x: Math.sin(i * 0.07), z: Math.cos(i * 0.05) }));
  const play = () => { const s = createState(B, 99); for (const inp of inputs) step(s, inp, B); return s.commander; };
  assert.deepEqual(play(), play());
});

test('sim 코드는 document·window·three·Math.random을 쓰지 않는다', () => {
  const dir = join(ROOT, 'js/sim');
  for (const f of readdirSync(dir)) {
    const src = readFileSync(join(dir, f), 'utf8');
    assert.ok(!/\bdocument\b|\bwindow\b|from ['"]three|Math\.random/.test(src), `${f}에 금지 항목`);
  }
});
