// M4 습격 완료 기준 4개 + 좀비·방어·침입·방폭문·포탑·수리 규칙 (plan.md ① 좀비, ③ 적 AI, ⑥ 습격)
// + 작업장 도구·탐사 장비 (기획서 v0.1.2)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../js/config.js';
import { createState, serialize, deserialize } from '../js/sim/state.js';
import { tick, DAY_TICKS, DAYLIGHT_TICKS } from '../js/sim/time.js';
import {
  getRaidSize, zombieHp, zombiePos, entrancePoint, defenseDps, doorMax, upgradeDoor, canUpgradeDoor, onNightStart,
} from '../js/sim/raid.js';
import {
  debugPlaceRoom, assignWorker, startTurret, canBuildTurret, assignBuilder, startRepair, canRepair, repairCost,
  turrets, startCraft, debugDig, startBuild,
} from '../js/sim/bunker.js';
import { startExpedition, assignGatherer, tileIndex } from '../js/sim/surface.js';

const RR = CONFIG.RAID_RULES;
const B = CONFIG.BUNKER;
const SC = B.SHAFT_COL;
const N = CONFIG.SURFACE.SIZE;
const TICK = CONFIG.TIME.TICK_SEC;
const ticks = (state, n) => { for (let i = 0; i < n; i++) tick(state); };
const secTicks = (sec) => Math.round(sec / TICK);
const rich = (s) => { Object.assign(s.resources, { food: 150, water: 150, wood: 150, scrap: 150 }); };
const gen = (s) => s.bunker.rooms.find((r) => r.type === 'generator');
/** 둥지를 전부 없애 마릿수를 공식의 기본값으로 */
const noNests = (s) => { for (const t of s.surface.tiles) if (t.type === 'nest') { t.type = 'forest'; t.deposit = 120; } return s; };
/** n일차 밤 시작 직전으로 */
const toNight = (s, day) => { s.time.tick = (day - 1) * DAY_TICKS + DAYLIGHT_TICKS - 1; };
const power = (s, n) => { const crew = s.survivors.filter((v) => v.job === 'rest').slice(0, n); for (const v of crew) assignWorker(s, v.id, gen(s).id); return crew; };

// ---------- ⑥-1 ----------
test('⑥ 밤 시작 시 공식대로의 마릿수가 맵 가장자리에서 입구로 몰려온다', () => {
  for (const day of [1, 2, 3, 4]) {
    const s = noNests(createState(100 + day));
    s.door.hp = 1e9;
    toNight(s, day);
    assert.equal(s.raid.active, false, '낮엔 습격 없음');
    tick(s);
    const expected = Math.min(4 + 2 * (day - 1), 40);
    assert.equal(s.raid.active, true);
    assert.equal(s.raid.zombies.length, expected, `${day}일차: ${expected}마리`);
    // 모두 같은 쪽 가장자리, 맵 바깥에서 시작
    for (const z of s.raid.zombies) {
      const outside = z.sx < 0 || z.sy < 0 || z.sx > N || z.sy > N;
      assert.ok(outside, `가장자리 밖에서 시작 (${z.sx.toFixed(1)}, ${z.sy.toFixed(1)})`);
    }
    // 입구로 다가간다
    const e = entrancePoint();
    const d0 = s.raid.zombies.map((z) => { const p = zombiePos(z); return Math.hypot(p.x - e.x, p.y - e.y); });
    ticks(s, secTicks(5));
    const d1 = s.raid.zombies.map((z) => { const p = zombiePos(z); return Math.hypot(p.x - e.x, p.y - e.y); });
    assert.ok(d1.every((d, k) => d < d0[k]), '거리가 줄어든다');
    // 이동 10초(+줄 간격) 뒤에는 모두 문 앞
    ticks(s, secTicks(RR.APPROACH_SEC + expected * RR.STAGGER_SEC));
    assert.ok(s.raid.zombies.every((z) => z.phase === 'door'), '모두 입구 도착');
    assert.ok(s.log.some((e2) => e2.key === 'log.raidStart' && e2.params.n === expected));
  }
});

test('마릿수: 링 3 이내 미제거 둥지 1곳당 +2, 최대 40', () => {
  const s = noNests(createState(110));
  s.door.hp = 1e9;
  const n3 = s.surface.tiles.findIndex((t) => t.ring === 3);
  const n5 = s.surface.tiles.findIndex((t) => t.ring === 5);
  Object.assign(s.surface.tiles[n3], { type: 'nest', deposit: null });
  Object.assign(s.surface.tiles[n5], { type: 'nest', deposit: null });
  toNight(s, 2);
  tick(s);
  assert.equal(s.raid.zombies.length, 4 + 2 + 2, '링 3 둥지만 +2');
  const s2 = noNests(createState(111));
  assert.equal(getRaidSize(s2, 25), 40);
});

test('좀비 종류: 1~2일차는 일반만, 3일차부터 돌격형, 5일차부터 거구 / 체력 공식', () => {
  const Zc = CONFIG.ZOMBIES;
  const normal = (d) => Zc.normal.hpBase + Zc.normal.hpPerDay * d;
  assert.equal(zombieHp('normal', 1), normal(1));
  assert.equal(zombieHp('normal', 4), normal(4));
  assert.equal(zombieHp('runner', 5), Math.round(normal(5) * Zc.runner.hpMult));
  assert.equal(zombieHp('brute', 5), Math.round(normal(5) * Zc.brute.hpMult));
  const count = (day, seeds) => {
    const c = { normal: 0, runner: 0, brute: 0 };
    for (let k = 0; k < seeds; k++) {
      const s = noNests(createState(200 + k));
      onNightStart(s, day);
      for (const z of s.raid.zombies) c[z.type]++;
    }
    return c;
  };
  const d2 = count(2, 30);
  assert.equal(d2.runner + d2.brute, 0);
  const d3 = count(3, 60);
  assert.equal(d3.brute, 0);
  const r3 = d3.runner / (d3.normal + d3.runner);
  assert.ok(r3 > 0.1 && r3 < 0.3, `3일차 돌격형 비율 ${r3.toFixed(2)} (기대 0.2)`);
  const d6 = count(6, 60);
  const total = d6.normal + d6.runner + d6.brute;
  assert.ok(d6.brute / total > 0.04 && d6.brute / total < 0.17, `거구 ${(d6.brute / total).toFixed(2)} (기대 0.1)`);
  // 돌격형은 2배 빨리 도착
  const s = noNests(createState(300));
  onNightStart(s, 4);
  for (const z of s.raid.zombies) {
    const base = z.type === 'runner' ? RR.APPROACH_SEC / 2 : RR.APPROACH_SEC;
    assert.ok(z.arrive >= base && z.arrive < base + s.raid.zombies.length * RR.STAGGER_SEC + 1e-9);
  }
});

// ---------- ⑥-2 ----------
test('⑥ 좀비가 방폭문 체력을 깎고, 경비·포탑이 좀비를 처치한다', () => {
  // 1) 방어 없음: 4마리 × 초당 2 = 초당 8씩 깎인다
  const s = noNests(createState(120));
  toNight(s, 1);
  tick(s);
  ticks(s, secTicks(RR.APPROACH_SEC + 4 * RR.STAGGER_SEC));
  const hp0 = s.door.hp;
  ticks(s, secTicks(10));
  assert.ok(Math.abs(hp0 - s.door.hp - 80) < 0.5, `10초에 80 감소 (${(hp0 - s.door.hp).toFixed(1)})`);
  assert.ok(s.log.some((e) => e.key === 'log.doorHit'), '"방폭문 피해!" 기록');
  assert.equal(s.raid.killed, 0);

  // 2) 경비실(전투 특기 = 초당 8) + 포탑 1기(초당 8)
  const d = noNests(createState(121));
  rich(d);
  power(d, 2); // 전력 12 ≥ 정수 3 + 경비 2 + 포탑 4
  const guard = debugPlaceRoom(d, 'guard', 2, SC + 1);
  const fighter = d.survivors.find((v) => v.specialty === 'combat');
  assert.equal(assignWorker(d, fighter.id, guard.id).ok, true);
  assert.equal(defenseDps(d), 8, '경비 1명 = 그 사람의 전투력');
  const tu = startTurret(d);
  const builder = d.survivors.find((v) => v.job === 'rest');
  assignBuilder(d, builder.id, tu.id);
  ticks(d, secTicks(B.ROOMS.turret.sec / (builder.specialty === 'build' ? 1 / 0.67 : 1)) + 5);
  assert.equal(turrets(d)[0].done, true);
  assert.equal(turrets(d)[0].on, true);
  assert.equal(defenseDps(d), 16, '경비 8 + 포탑 8');
  const day = 1;
  toNight(d, day);
  tick(d);
  const n = d.raid.zombies.length;
  ticks(d, secTicks(40));
  assert.equal(d.raid.killed, n, `${n}마리 모두 처치`);
  assert.equal(d.raid.active, false, '습격 끝');
  assert.ok(d.door.hp > 0 && d.door.hp < doorMax(d), '문은 조금 상했지만 버팀');
  assert.ok(d.log.some((e) => e.key === 'log.raidRepelled'));
});

test('방어는 가장 앞(먼저 도착한) 좀비부터 맞힌다', () => {
  const s = noNests(createState(122));
  rich(s);
  power(s, 2);
  const g = debugPlaceRoom(s, 'guard', 2, SC + 1);
  assignWorker(s, s.survivors.find((v) => v.specialty === 'combat').id, g.id);
  toNight(s, 1);
  tick(s);
  ticks(s, secTicks(RR.APPROACH_SEC + 4 * RR.STAGGER_SEC));
  const atDoor = s.raid.zombies.filter((z) => z.phase === 'door').sort((a, b) => a.order - b.order);
  const hurt = atDoor.filter((z) => z.hp < z.maxHp);
  assert.ok(hurt.length <= 1, '한 번에 한 마리씩');
  if (hurt.length === 1) assert.equal(hurt[0].id, atDoor[0].id, '맨 앞 좀비');
});

test('포탑: 최대 2기, 전력 4씩, 경비·포탑은 전력 우선순위 최상위', () => {
  const s = createState(123);
  rich(s);
  assert.equal(canBuildTurret(s).ok, true);
  startTurret(s);
  startTurret(s);
  assert.equal(canBuildTurret(s).reason, 'reason.turretMax');
  for (const t of turrets(s)) { t.done = true; t.progress = 1; }
  const [t1, t2] = turrets(s);
  const water = s.bunker.rooms.find((r) => r.type === 'water');
  const tu = B.ROOMS.turret.use, wu = B.ROOMS.water.use;
  // 발전실 1명 생산으로: 우선순위 뒤(정수실)부터 꺼진다
  power(s, 1);
  assert.equal(s.power.consumed, tu * 2 + wu);
  const P = s.power.produced;
  const order = [t1, t2, water];
  let used = tu * 2 + wu;
  const expectOn = new Map(order.map((r) => [r, true]));
  for (let k = order.length - 1; k >= 0 && used > P; k--) { expectOn.set(order[k], false); used -= order[k] === water ? wu : tu; }
  for (const r of order) assert.equal(r.on, expectOn.get(r), `생산 ${P}: ${r.type}#${r.id}`);
  assert.ok(!water.on || t1.on, '포탑이 정수실보다 먼저 켜진다');
  if (P < tu * 2 + wu) assert.equal(water.on, false, '모자라면 정수실이 먼저 꺼진다');
});

// ---------- ⑥-3 ----------
test('⑥ 방폭문이 부서지면 1층 방이 고장 나고 생존자가 다친다', () => {
  const s = noNests(createState(130));
  rich(s);
  const [w1, w2] = power(s, 2); // 발전실 2명
  const water = s.bunker.rooms.find((r) => r.type === 'water');
  const w3 = s.survivors.find((v) => v.job === 'rest');
  assignWorker(s, w3.id, water.id);
  s.door.hp = 5; // 곧 부서질 문
  toNight(s, 3); // 8마리
  tick(s);
  ticks(s, secTicks(RR.APPROACH_SEC + 2));
  assert.equal(s.raid.breached, true, '문이 부서짐');
  assert.equal(s.door.hp, 0);
  assert.ok(s.log.some((e) => e.key === 'log.breach'));
  assert.ok(s.events.some((e) => e.key === 'toast.breach'));
  // 샤프트에서 가까운 1층 방부터 차례로 고장
  ticks(s, secTicks(30));
  const floor1 = s.bunker.rooms.filter((r) => r.floor === 1 && r.type !== 'shaft');
  assert.ok(floor1.every((r) => r.broken), '1층 방이 전부 고장');
  assert.ok(s.log.filter((e) => e.key === 'log.roomBroken').length >= 2);
  assert.equal(gen(s).on, false, '고장 난 방은 작동 안 함');
  assert.equal(s.power.produced, 0);
  // 그 방에서 일하던 사람이 다쳤다
  for (const v of [w1, w2, w3]) assert.ok(v.hp < 100, `${v.name} 체력 ${v.hp.toFixed(0)}`);
  assert.ok([w1, w2, w3].every((v) => Math.abs(v.hp - (100 - RR.CONTACT_DPS * RR.CONTACT_SEC)) < 0.5), '접촉 1초 = 체력 -20');
  assert.ok([w1, w2, w3].every((v) => v.job === 'rest'), '맞고 나서 그 방에서 대피');
  // 새벽: 남은 좀비를 모두가 처치, 전원 체력 -15
  const hpBefore = s.survivors.map((v) => v.hp);
  ticks(s, DAY_TICKS - (s.time.tick % DAY_TICKS));
  assert.equal(s.raid.active, false);
  assert.equal(s.raid.zombies.length, 0);
  s.survivors.forEach((v, k) => assert.ok(Math.abs(hpBefore[k] - 15 - v.hp) < 0.5 || v.hp <= 0, '전원 -15'));
  assert.ok(s.log.some((e) => e.key === 'log.dawnFight'));
});

test('고장 난 방 수리: 건설비 30% + 10초, 수리하면 다시 작동', () => {
  const s = createState(131);
  rich(s);
  const g = gen(s);
  g.broken = true;
  assert.deepEqual(repairCost('generator'), { scrap: 8, wood: 3 }, '고철 25·목재 10의 30% 올림');
  assert.deepEqual(repairCost('radio'), { scrap: 24, wood: 12 }, '통신부품은 수리비에서 뺀다');
  const scrap0 = s.resources.scrap, wood0 = s.resources.wood;
  const r = startRepair(s, g.id);
  assert.equal(r.ok, true);
  assert.equal(s.resources.scrap, scrap0 - 8);
  assert.equal(s.resources.wood, wood0 - 3);
  assert.equal(canRepair(s, g.id).reason, 'reason.repairing');
  const b = s.survivors.find((v) => v.specialty !== 'build');
  assert.equal(assignBuilder(s, b.id, g.id).ok, true);
  ticks(s, secTicks(B.REPAIR.sec) - 2);
  assert.equal(g.broken, true);
  ticks(s, 3);
  assert.equal(g.broken, false, '10초 뒤 수리 완료');
  assert.equal(b.job, 'rest');
  const w = s.survivors.find((v) => v.job === 'rest');
  assignWorker(s, w.id, g.id);
  assert.ok(s.power.produced > 0, '다시 전력 생산');
});

test('문이 버티면 새벽에 남은 좀비는 물러가고, 문은 낮 동안 초당 1% 회복', () => {
  const s = noNests(createState(132));
  s.door.hp = 1e9;
  toNight(s, 1);
  tick(s);
  ticks(s, DAY_TICKS - DAYLIGHT_TICKS);
  assert.equal(s.raid.active, false);
  assert.ok(s.log.some((e) => e.key === 'log.retreat'));
  assert.ok(s.survivors.every((v) => v.hp === 100), '물러가면 아무도 안 다침');

  const r = createState(133);
  r.door.hp = 0;
  ticks(r, secTicks(10));
  assert.ok(Math.abs(r.door.hp - 30) < 0.5, `10초에 300의 10% (${r.door.hp.toFixed(1)})`);
  ticks(r, secTicks(100));
  assert.equal(r.door.hp, 300, '최대에서 멈춤');
  r.door.hp = 100;
  r.time.tick = DAYLIGHT_TICKS + 1; // 밤
  ticks(r, secTicks(10));
  assert.equal(r.door.hp, 100, '밤엔 회복 안 함');
});

test('방폭문 강화: Lv2 600(고철 40), Lv3 1000(고철 80·목재 20)', () => {
  const s = createState(134);
  rich(s);
  s.door.hp = 250;
  assert.equal(upgradeDoor(s).ok, true);
  assert.equal(s.door.level, 2);
  assert.equal(doorMax(s), 600);
  assert.equal(s.door.hp, 550, '최대 체력이 오른 만큼 현재 체력도 오른다');
  assert.equal(s.resources.scrap, 110);
  s.resources.wood = 10;
  assert.deepEqual(canUpgradeDoor(s).params.need, { wood: 10 });
  s.resources.wood = 20;
  assert.equal(upgradeDoor(s).ok, true);
  assert.equal(doorMax(s), 1000);
  assert.equal(canUpgradeDoor(s).reason, 'reason.maxLevel');
});

// ---------- ⑥-4 ----------
test('⑥ 5일차 습격이 평소의 1.5배 규모다', () => {
  const s = noNests(createState(140));
  s.door.hp = 1e9;
  toNight(s, 5);
  tick(s);
  const normal5 = 4 + 2 * (5 - 1); // 12
  assert.equal(s.raid.zombies.length, Math.round(normal5 * 1.5), '5일차 18마리');
  const s4 = noNests(createState(141));
  s4.door.hp = 1e9;
  toNight(s4, 6);
  tick(s4);
  assert.equal(s4.raid.zombies.length, 4 + 2 * 5, '6일차는 다시 평소 공식 (14)');
  assert.equal(getRaidSize(s, 10), Math.round((4 + 18) * 1.5), '10일차도 1.5배');
});

// ---------- 저장 ----------
test('습격 중 저장·복원, v3 저장은 최신 버전으로 올라간다', () => {
  const s = noNests(createState(150));
  toNight(s, 2);
  tick(s);
  ticks(s, 50);
  const r = deserialize(serialize(s));
  assert.deepEqual(r.raid, s.raid);
  ticks(r, 200);
  assert.ok(r.raid.zombies.some((z) => z.phase === 'door'), '복원 후 이어서 진행');

  const v3 = JSON.parse(serialize(createState(151)));
  v3.version = 3;
  delete v3.raid;
  v3.survivors = v3.survivors.map(({ tool, gear, ...rest }) => rest);
  v3.bunker.rooms = v3.bunker.rooms.map(({ repairing, damage, ...rest }) => rest);
  const up = deserialize(JSON.stringify(v3));
  assert.ok(up);
  assert.equal(up.version, CONFIG.SAVE.VERSION);
  assert.equal(up.raid.active, false);
  assert.ok(up.survivors.every((v) => v.tool === false && v.gear === false));
});

// ---------- 도구·탐사 장비 (v0.1.2) ----------
test('작업장: 도구·탐사 장비 제작 → 자동 장착 (도구는 건설·채집 특기 먼저)', () => {
  const s = createState(160);
  rich(s);
  power(s, 2);
  const ws = debugPlaceRoom(s, 'workshop', 2, SC + 1);
  const tech = s.survivors.find((v) => v.job === 'rest');
  assignWorker(s, tech.id, ws.id);
  assert.equal(startCraft(s, ws.id, 'tool').ok, true);
  assert.equal(s.resources.wood, 140);
  assert.equal(s.resources.scrap, 145);
  ticks(s, secTicks(31));
  const holder = s.survivors.find((v) => v.tool);
  assert.ok(holder);
  assert.equal(holder.specialty, 'build');
  assert.equal(startCraft(s, ws.id, 'gear').ok, true);
  ticks(s, secTicks(31));
  assert.equal(s.survivors.filter((v) => v.gear).length, 1);
});

test('도구: 채집 +25%, 공사에 도구 가진 사람이 있으면 건설 +25%', () => {
  const run = (withTool) => {
    const s = createState(161);
    const i = s.surface.tiles.findIndex((t) => t.type === 'forest' && t.revealed);
    const w = s.survivors.find((v) => v.specialty === 'combat');
    w.tool = withTool;
    assignGatherer(s, w.id, i);
    const w0 = s.resources.wood;
    ticks(s, secTicks(160));
    return s.resources.wood - w0;
  };
  const plain = run(false), tooled = run(true);
  const perDay = CONFIG.SURFACE.TILES.forest.gather.perDay;
  const e0 = perDay * (160 / CONFIG.TIME.DAY_SEC);
  assert.ok(Math.abs(plain - e0) <= 1 && Math.abs(tooled - e0 * (1 + B.TOOL_SPEED_BONUS)) <= 1, `채집 ${plain} → ${tooled}`);

  const build = (withTool) => {
    const s = createState(162);
    rich(s);
    debugDig(s, 2, SC + 1);
    const b = startBuild(s, 'storage', 2, SC + 1);
    const w = s.survivors.find((v) => v.specialty === 'combat');
    w.tool = withTool;
    assignBuilder(s, w.id, b.id);
    const room = s.bunker.rooms.find((r) => r.id === b.id);
    let n = 0;
    while (!room.done) { tick(s); n++; }
    return n;
  };
  assert.equal(build(false), secTicks(15));
  assert.ok(Math.abs(build(true) - secTicks(15 / 1.25)) <= 1, '15초 → 12초');
});

test('탐사 장비: 원정대에 가진 사람이 있으면 원정 시간 ×0.75', () => {
  const s = createState(163);
  const i = tileIndex(N, 5, 3); // 링 2 = 40초
  const [a, b] = s.survivors;
  a.gear = true;
  startExpedition(s, i, [a.id, b.id], 'explore');
  assert.equal(s.surface.expeditions[0].totalTicks, secTicks(40 * 0.75));
  ticks(s, secTicks(30));
  assert.equal(s.surface.tiles[i].revealed, true);
});
