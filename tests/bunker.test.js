// M3 벙커 완료 기준 9개 + 굴착·건설·전력망 규칙 (plan.md ① 벙커 방, ② 경제, ⑥ 벙커)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../js/config.js';
import { createState, serialize, deserialize } from '../js/sim/state.js';
import { tick, DAY_TICKS } from '../js/sim/time.js';
import {
  canDig, startDig, canBuild, startBuild, assignBuilder, assignWorker, unassignBunker, moveSurvivor,
  isDug, roomAt, digAt, getBuildStage, buildersOf, workersOf, debugPlaceRoom, debugDig, placementFor,
  startCraft, canCraft, projectRemainingSec,
} from '../js/sim/bunker.js';
import { topBarModel } from '../js/render/viewModel.js';

const B = CONFIG.BUNKER;
const SC = B.SHAFT_COL; // 3
const ticks = (state, n) => { for (let i = 0; i < n; i++) tick(state); };
const secTicks = (sec) => Math.round(sec / CONFIG.TIME.TICK_SEC);
const rich = (s) => { Object.assign(s.resources, { food: 150, water: 150, wood: 150, scrap: 150 }); };
const bySpec = (s, spec) => s.survivors.find((v) => v.specialty === spec);
const notSpec = (s, spec, n) => s.survivors.filter((v) => v.specialty !== spec).slice(0, n);
const gen = (s) => s.bunker.rooms.find((r) => r.type === 'generator');
const water = (s) => s.bunker.rooms.find((r) => r.type === 'water');

test('시작 벙커: 샤프트 1~2층, 1층 발전실·정수실 완공, 나머지는 흙', () => {
  const s = createState(1);
  const types = s.bunker.rooms.map((r) => `${r.type}@${r.floor}:${r.col}`).sort();
  assert.deepEqual(types, ['generator@1:1', 'shaft@1:3', 'shaft@2:3', 'water@1:4'].sort());
  assert.ok(s.bunker.rooms.every((r) => r.done));
  const dug = s.bunker.cells.filter((c) => c.dug).length;
  assert.equal(dug, 2 + 2 + 2, '샤프트 2칸 + 발전실 2칸 + 정수실 2칸');
  assert.equal(s.bunker.cells.length, 7 * 8, '최대 7열 × 8층');
  assert.equal(s.door.hp, 300);
});

// ---------- ⑥-1 ----------
test('⑥ 샤프트에 이어진 빈 칸을 굴착하면 목재가 빠지고 진행바 후 칸이 열린다', () => {
  const s = createState(2);
  const wood0 = s.resources.wood;
  // 2층 샤프트 옆 칸
  assert.equal(canDig(s, 2, SC - 1).ok, true);
  const r = startDig(s, 2, SC - 1);
  assert.equal(r.ok, true);
  assert.equal(s.resources.wood, wood0 - 5, '목재 5');
  assert.equal(isDug(s, 2, SC - 1), false);
  // 인원이 없으면 멈춰 있다
  ticks(s, 200);
  assert.equal(digAt(s, 2, SC - 1).progress, 0, '건설 인원 없으면 진행 0');
  const w = notSpec(s, 'build', 1)[0];
  assert.equal(assignBuilder(s, w.id, r.id).ok, true);
  assert.equal(w.job, 'build');
  ticks(s, secTicks(B.DIG.sec) / 2);
  const p = digAt(s, 2, SC - 1).progress;
  assert.ok(p > 0.45 && p < 0.55, `절반쯤 진행 (${p})`);
  ticks(s, secTicks(B.DIG.sec) / 2);
  assert.equal(isDug(s, 2, SC - 1), true, '10초 뒤 열림');
  assert.equal(digAt(s, 2, SC - 1), null);
  assert.equal(w.job, 'rest', '끝나면 휴식');
  assert.ok(s.log.some((e) => e.key === 'log.digDone'));
});

test('굴착 가능한 칸: 샤프트·파낸 칸 옆만, 샤프트 줄은 위층 샤프트가 있어야', () => {
  const s = createState(3);
  assert.equal(canDig(s, 2, SC + 1).ok, true);
  assert.equal(canDig(s, 2, SC + 2).reason, 'reason.notConnected', '샤프트에서 한 칸 떨어진 흙');
  assert.equal(canDig(s, 1, 0).ok, true, '1층 발전실 왼쪽');
  assert.equal(canDig(s, 1, 6).ok, true, '1층 정수실 오른쪽');
  assert.equal(canDig(s, 3, SC).ok, true, '2층 샤프트 바로 아래');
  assert.equal(canDig(s, 4, SC).reason, 'reason.shaftAbove');
  assert.equal(canDig(s, 3, SC - 1).reason, 'reason.notConnected', '3층은 샤프트가 아직 없다');
  assert.equal(canDig(s, 1, 1).reason, 'reason.dug');
  startDig(s, 2, SC + 1);
  assert.equal(canDig(s, 2, SC + 1).reason, 'reason.digBusy');
  s.resources.wood = 4;
  assert.equal(canDig(s, 2, SC - 1).reason, 'reason.need');
  assert.deepEqual(canDig(s, 2, SC - 1).params.need, { wood: 1 });
});

test('아래층으로: 굴착 → 샤프트 → 그 층 굴착', () => {
  const s = createState(4);
  rich(s);
  const w = notSpec(s, 'build', 1)[0];
  const d = startDig(s, 3, SC);
  assignBuilder(s, w.id, d.id);
  ticks(s, secTicks(10));
  assert.equal(canBuild(s, 'shaft', 3, SC).ok, true);
  assert.equal(canBuild(s, 'generator', 3, SC).reason, 'reason.shaftCol');
  const sh = startBuild(s, 'shaft', 3, SC);
  assignBuilder(s, w.id, sh.id);
  ticks(s, secTicks(B.ROOMS.shaft.sec));
  assert.equal(roomAt(s, 3, SC).done, true);
  assert.equal(canDig(s, 3, SC - 1).ok, true, '샤프트가 생기니 3층 옆 칸을 팔 수 있다');
});

// ---------- ⑥-2 ----------
test('⑥ 자원이 부족하면 건설이 거부되고 이유가 나온다', () => {
  const s = createState(5);
  debugDig(s, 2, 4); debugDig(s, 2, 5);
  s.resources.wood = 10;
  const c = canBuild(s, 'quarters', 2, 4); // 목재 20
  assert.equal(c.ok, false);
  assert.equal(c.reason, 'reason.need');
  assert.deepEqual(c.params.need, { wood: 10 });
  const r = startBuild(s, 'quarters', 2, 4);
  assert.equal(r.ok, false);
  assert.equal(s.resources.wood, 10, '자원이 빠지지 않음');
  assert.equal(roomAt(s, 2, 4), null);
  // 무선실은 통신부품이 필요
  rich(s);
  assert.deepEqual(canBuild(s, 'radio', 2, 4).params.need, { parts: 1 });
  s.resources.wood = 20;
  assert.equal(canBuild(s, 'quarters', 2, 4).ok, true);
});

test('방 자리: 2칸 방은 빈 칸 2개, 샤프트 줄 금지, 공사 중인 칸 금지', () => {
  const s = createState(6);
  rich(s);
  debugDig(s, 2, 4);
  assert.equal(canBuild(s, 'quarters', 2, 4).reason, 'reason.noSpace');
  assert.equal(canBuild(s, 'storage', 2, 4).ok, true, '1칸 방은 된다');
  debugDig(s, 2, 5);
  assert.equal(placementFor(s, 'quarters', 2, 5), 4, '오른쪽 칸을 눌러도 왼쪽으로 맞춰 들어감');
  assert.equal(canBuild(s, 'quarters', 2, SC).reason, 'reason.full', '샤프트가 있는 칸');
  debugDig(s, 3, SC);
  assert.equal(canBuild(s, 'storage', 3, SC).reason, 'reason.shaftCol', '샤프트 줄의 빈 칸');
  assert.equal(canBuild(s, 'quarters', 2, 0).reason, 'reason.notDug');
  startBuild(s, 'quarters', 2, 4);
  assert.equal(canBuild(s, 'storage', 2, 5).reason, 'reason.full');
});

// ---------- ⑥-3 ----------
test('⑥ 방 건설이 비계 → 골조 → 완성 3단계, 건설 인원 수에 따라 시간이 줄어든다', () => {
  const sec = B.ROOMS.quarters.sec; // 20초
  const run = (pick) => {
    const s = createState(7);
    rich(s);
    debugDig(s, 2, 4); debugDig(s, 2, 5);
    const b = startBuild(s, 'quarters', 2, 4);
    const room = roomAt(s, 2, 4);
    assert.equal(getBuildStage(room), 'scaffold');
    for (const v of pick(s)) assert.equal(assignBuilder(s, v.id, b.id).ok, true);
    const stages = new Set();
    let n = 0;
    while (!room.done && n < 10000) { tick(s); n++; stages.add(getBuildStage(room)); }
    return { n, stages: [...stages] };
  };
  const one = run((s) => notSpec(s, 'build', 1));
  assert.deepEqual(one.stages, ['scaffold', 'frame', 'done'], '3단계 순서');
  assert.ok(Math.abs(one.n - secTicks(sec)) <= 1, `1명: ${one.n}틱`);
  const two = run((s) => notSpec(s, 'build', 2));
  assert.ok(Math.abs(two.n - secTicks(sec * 0.6)) <= 1, `2명: ${two.n}틱 (×0.6)`);
  const spec = run((s) => [bySpec(s, 'build')]);
  assert.ok(Math.abs(spec.n - secTicks(sec * 0.67)) <= 1, `건설 특기: ${spec.n}틱 (×0.67)`);
  const both = run((s) => [bySpec(s, 'build'), notSpec(s, 'build', 1)[0]]);
  assert.ok(Math.abs(both.n - secTicks(sec * 0.6 * 0.67)) <= 1, `2명+특기: ${both.n}틱`);
  assert.ok(one.n > two.n && two.n > both.n);
});

test('공사 인원은 최대 2명, 다른 일 중인 사람은 못 넣음, 완공되면 휴식', () => {
  const s = createState(8);
  rich(s);
  debugDig(s, 2, 4);
  const b = startBuild(s, 'storage', 2, 4);
  const [a, c, d] = s.survivors;
  assert.equal(assignBuilder(s, a.id, b.id).ok, true);
  assert.equal(assignBuilder(s, c.id, b.id).ok, true);
  assert.equal(assignBuilder(s, d.id, b.id).reason, 'reason.full');
  debugDig(s, 2, 5);
  const b2 = startBuild(s, 'storage', 2, 5);
  assert.equal(assignBuilder(s, a.id, b2.id).reason, 'reason.unavailable', '이미 공사 중인 사람');
  assert.ok(Number.isFinite(projectRemainingSec(s, b.id)));
  ticks(s, secTicks(15));
  assert.equal(roomAt(s, 2, 4).done, true);
  assert.ok([a, c].every((v) => v.job === 'rest'));
  assert.ok(s.events.some((e) => e.key === 'toast.built'));
  assert.ok(s.events.some((e) => e.key === 'fx.built'));
});

// ---------- ⑥-4 ----------
test('⑥ 발전실에 근무자를 넣으면 전력 생산이 오르고, 빼면 내려간다', () => {
  const s = createState(9);
  assert.equal(s.power.produced, 0);
  const [a, b] = notSpec(s, 'tech', 2);
  assert.equal(assignWorker(s, a.id, gen(s).id).ok, true);
  assert.equal(s.power.produced, 6, '1명 +6');
  assert.equal(assignWorker(s, b.id, gen(s).id).ok, true);
  assert.equal(s.power.produced, 12, '2명 +12');
  const t = bySpec(s, 'tech');
  assert.equal(assignWorker(s, t.id, gen(s).id).reason, 'reason.full', '근무 최대 2');
  unassignBunker(s, b.id);
  assert.equal(s.power.produced, 6, '빼면 내려감');
  unassignBunker(s, a.id);
  assert.equal(s.power.produced, 0);
  assignWorker(s, t.id, gen(s).id);
  assert.equal(s.power.produced, 9, '기술 특기 +50%');
  // 상단 바에 반영
  const bar = topBarModel(s).find((i) => i.id === 'power');
  assert.equal(bar.text, '9/3');
});

// ---------- ⑥-5 ----------
test('⑥ 전력이 부족하면 우선순위 낮은 방부터 꺼진다', () => {
  const s = createState(10);
  rich(s);
  // 2층: 샤프트 오른쪽에 수경재배실(4-5), 왼쪽에 숙소(1-2)
  debugPlaceRoom(s, 'farm', 2, 4);
  debugPlaceRoom(s, 'quarters', 2, 1);
  // 수요: 정수 3 + 재배 3 + 숙소 1 = 7
  assert.equal(s.power.consumed, 7);
  const [a] = notSpec(s, 'tech', 1);
  assignWorker(s, a.id, gen(s).id); // 생산 6 < 7
  const on = (type) => s.bunker.rooms.find((r) => r.type === type).on;
  assert.equal(on('water'), true, '정수실(우선순위 높음) 켜짐');
  assert.equal(on('farm'), true, '수경재배실 켜짐');
  assert.equal(on('quarters'), false, '숙소(가장 낮음)부터 꺼짐');
  assert.equal(s.power.used, 6);
  unassignBunker(s, a.id); // 생산 0
  assert.equal(on('water'), false);
  assert.equal(on('farm'), false);
  assert.equal(on('quarters'), false);
  // 생산 6, 수요 7에서 숙소를 빼면 3+3=6 딱 맞음
  assignWorker(s, a.id, gen(s).id);
  const [b] = notSpec(s, 'tech', 2).slice(1);
  assignWorker(s, b.id, gen(s).id); // 12
  assert.ok(['water', 'farm', 'quarters'].every(on), '충분하면 전부 켜짐');
});

test('전력 우선순위: 경비실 > 정수실 > 수경재배실 > 의무실 > 작업장 > 숙소 > 무선실', () => {
  const s = createState(11);
  // 각 층 샤프트 옆에 방 하나씩 붙이기 위해 샤프트를 8층까지 깐다
  for (let f = 3; f <= 8; f++) debugPlaceRoom(s, 'shaft', f, SC);
  const placed = {
    guard: debugPlaceRoom(s, 'guard', 2, SC + 1),
    farm: debugPlaceRoom(s, 'farm', 3, SC + 1),
    medbay: debugPlaceRoom(s, 'medbay', 4, SC + 1),
    workshop: debugPlaceRoom(s, 'workshop', 5, SC + 1),
    quarters: debugPlaceRoom(s, 'quarters', 6, SC + 1),
    radio: debugPlaceRoom(s, 'radio', 7, SC + 1),
  };
  // 수요: 경비2 + 정수3 + 재배3 + 의무3 + 작업4 + 숙소1 + 무선10 = 26
  assert.equal(s.power.consumed, 26);
  const order = ['guard', 'water', 'farm', 'medbay', 'workshop', 'quarters', 'radio'];
  const isOn = (t) => (t === 'water' ? water(s) : placed[t]).on;
  // 생산을 직접 바꿔가며 확인: 생산 p일 때 앞에서부터 누적 수요가 p 이하인 것만 켜짐
  const uses = { guard: 2, water: 3, farm: 3, medbay: 3, workshop: 4, quarters: 1, radio: 10 };
  for (const workers of [0, 1, 2]) {
    for (const v of s.survivors) if (v.job === 'room') unassignBunker(s, v.id);
    const crew = notSpec(s, 'tech', 2).slice(0, workers);
    for (const v of crew) assignWorker(s, v.id, gen(s).id);
    const p = s.power.produced;
    // 뒤에서부터 끄는 규칙: 누적합이 p를 넘는 동안 뒤를 끈다
    let total = 26;
    const expectOn = Object.fromEntries(order.map((t) => [t, true]));
    for (let k = order.length - 1; k >= 0 && total > p; k--) { expectOn[order[k]] = false; total -= uses[order[k]]; }
    for (const t of order) assert.equal(isOn(t), expectOn[t], `생산 ${p}: ${t}`);
  }
});

// ---------- ⑥-6 ----------
test('⑥ 샤프트와 끊긴 방은 전력망에서 빠져 작동하지 않는다', () => {
  const s = createState(12);
  rich(s);
  // 2층: 샤프트(3) 오른쪽 4는 빈 칸, 5-6에 수경재배실 → 빈 칸 때문에 끊김
  debugDig(s, 2, 4);
  const farm = debugPlaceRoom(s, 'farm', 2, 5);
  const [a, b] = notSpec(s, 'tech', 2);
  assignWorker(s, a.id, gen(s).id);
  assignWorker(s, b.id, gen(s).id); // 12
  assert.equal(farm.connected, false);
  assert.equal(farm.on, false, '전력이 남아도 꺼짐');
  assert.equal(s.power.consumed, 3, '끊긴 방은 수요에도 안 들어감');
  const c = s.survivors.find((v) => v.job === 'rest');
  assert.equal(assignWorker(s, c.id, farm.id).ok, true);
  const food0 = s.resources.food;
  ticks(s, 600);
  assert.equal(s.resources.food, food0, '끊긴 수경재배실은 식량을 못 만든다');
  // 사이 칸에 창고(1칸)를 지으면 이어진다
  debugPlaceRoom(s, 'storage', 2, 4);
  assert.equal(farm.connected, true);
  assert.equal(farm.on, true);
  ticks(s, 600);
  assert.ok(s.resources.food > food0, '이어지면 작동');
  // 위층 샤프트가 없는 층(공사 중)은 통째로 끊김
  const s2 = createState(13);
  debugDig(s2, 3, SC);
  s2.bunker.rooms.push({ id: 999, type: 'shaft', floor: 3, col: SC, w: 1, done: false, progress: 0, acc: 0, on: false, connected: false, broken: false, craft: null });
  debugDig(s2, 3, SC + 1);
  const g3 = debugPlaceRoom(s2, 'storage', 3, SC + 1);
  assert.equal(g3.connected, false, '샤프트 공사 중인 층의 방은 끊김');
});

// ---------- ⑥-7 ----------
test('⑥ 정수실·수경재배실 근무자가 있으면 물·식량이 늘어난다', () => {
  const s = createState(14);
  rich(s);
  s.resources.food = 0; s.resources.water = 0;
  const farm = debugPlaceRoom(s, 'farm', 2, SC + 1);
  const [g1, g2] = s.survivors.filter((v) => v.specialty === 'combat' || v.specialty === 'build');
  assignWorker(s, g1.id, gen(s).id);
  assignWorker(s, g2.id, gen(s).id); // 12 ≥ 6
  ticks(s, 600);
  assert.equal(s.resources.water, 0, '근무자 없으면 물 그대로');
  assert.equal(s.resources.food, 0);
  const t = bySpec(s, 'tech');
  const g = bySpec(s, 'gather');
  assignWorker(s, t.id, water(s).id);
  assignWorker(s, g.id, farm.id);
  ticks(s, 1200); // 120초 = 반나절
  // 정수실 기술 특기: 4 × 1.5 × 0.5일 = 3, 수경재배실 채집 특기: 4 × 1.5 × 0.5일 = 3
  assert.ok(Math.abs(s.resources.water - 3) <= 1, `물 ${s.resources.water}`);
  assert.ok(Math.abs(s.resources.food - 3) <= 1, `식량 ${s.resources.food}`);
  // 전력이 끊기면 멈춘다
  unassignBunker(s, g1.id); unassignBunker(s, g2.id);
  const w = s.resources.water;
  ticks(s, 500); // 새벽 정산 전까지만
  assert.equal(s.resources.water, w, '꺼지면 생산 멈춤');
});

// ---------- ⑥-8 ----------
test('⑥ 숙소를 지으면 인구 상한이 4 오른다', () => {
  const s = createState(15);
  rich(s);
  const [a, b] = notSpec(s, 'build', 2);
  assignWorker(s, a.id, gen(s).id); // 전력 6 ≥ 정수 3 + 숙소 1
  assert.equal(s.popCap, 6);
  debugDig(s, 2, SC + 1); debugDig(s, 2, SC + 2);
  const q = startBuild(s, 'quarters', 2, SC + 1);
  assignBuilder(s, b.id, q.id);
  ticks(s, secTicks(B.ROOMS.quarters.sec) - 2);
  assert.equal(s.popCap, 6, '공사 중엔 그대로');
  ticks(s, 3);
  assert.equal(s.popCap, 10, '완공되면 +4');
  assert.equal(topBarModel(s).find((i) => i.id === 'pop').text, '4/10');
  debugDig(s, 2, 1); debugDig(s, 2, 2);
  debugPlaceRoom(s, 'quarters', 2, 1);
  assert.equal(s.popCap, 14, '하나 더 지으면 +4');
});

test('창고를 지으면 자원별 저장 상한 +100', () => {
  const s = createState(16);
  debugPlaceRoom(s, 'storage', 1, 0);
  assert.equal(s.storageCap, 250);
});

// ---------- ⑥-9 ----------
// 습격(M4)이 결과에 섞이지 않도록 문을 아주 튼튼하게
const noRaid = (s) => { s.door.hp = 1e9; return s; };

test('⑥ 식량이나 물이 0인 채로 새벽이 오면 생존자 체력이 30 줄어든다', () => {
  const s = noRaid(createState(17));
  s.resources.food = 0;
  s.resources.water = 20;
  ticks(s, DAY_TICKS - 1);
  assert.ok(s.survivors.every((v) => v.hp === 100), '새벽 전엔 그대로');
  ticks(s, 1);
  assert.ok(s.survivors.every((v) => v.hp === 70), '식량 0 → 전원 -30');
  assert.equal(s.resources.water, 20 - 4 * 2, '물은 정상 소비');
  assert.ok(s.log.some((e) => e.key === 'log.starve' && e.params.res === 'food'));

  const s2 = noRaid(createState(18));
  s2.resources.food = 0;
  s2.resources.water = 0;
  ticks(s2, DAY_TICKS);
  assert.ok(s2.survivors.every((v) => v.hp === 40), '둘 다 0 → -60');
});

test('새벽 정산: 1인당 식량 2·물 2, 일부만 모자라면 모자란 인원만, 체력 0이면 사망', () => {
  const s = noRaid(createState(19));
  s.resources.food = 5; // 2명분 + 1
  ticks(s, DAY_TICKS);
  assert.equal(s.resources.food, 1);
  assert.equal(s.survivors.filter((v) => v.hp === 70).length, 2, '2명만 굶음');
  const s2 = noRaid(createState(20));
  s2.survivors[0].hp = 30;
  s2.resources.food = 0;
  ticks(s2, DAY_TICKS);
  assert.equal(s2.survivors.length, 3, '체력 0 → 사망');
  assert.ok(s2.log.some((e) => e.key === 'log.death'));
  // 밤 시작 굶주림 경고
  const s3 = noRaid(createState(21));
  s3.resources.water = 3;
  ticks(s3, CONFIG.TIME.DAYLIGHT_SEC * 10);
  assert.ok(s3.events.some((e) => e.key === 'toast.hungerWarn'));
});

test('부상자는 일을 못 하고, 의무실 근무자가 있으면 체력이 회복된다', () => {
  const s = createState(22);
  rich(s);
  const [a, b] = notSpec(s, 'tech', 2);
  assignWorker(s, a.id, gen(s).id);
  assignWorker(s, b.id, gen(s).id);
  const med = debugPlaceRoom(s, 'medbay', 2, SC + 1);
  const t = bySpec(s, 'tech');
  b.hp = 30;
  tick(s);
  assert.equal(b.job, 'rest', '부상자는 근무에서 빠짐');
  assert.equal(assignWorker(s, b.id, gen(s).id).reason, 'reason.unavailable');
  assignWorker(s, a.id, gen(s).id);
  assignWorker(s, t.id, med.id);
  // 생산 6 (a만) ≥ 정수 3 + 의무 3
  ticks(s, 1200); // 반나절, 기술 특기 40×1.5×0.5 = 30
  assert.ok(Math.abs(b.hp - 60) < 0.5, `체력 ${b.hp}`);
});

test('작업장: 무기 제작(고철 15) → 전투 특기에게 먼저 장착', () => {
  const s = createState(23);
  rich(s);
  const [a, b] = notSpec(s, 'tech', 2);
  assignWorker(s, a.id, gen(s).id);
  assignWorker(s, b.id, gen(s).id);
  const ws = debugPlaceRoom(s, 'workshop', 2, SC + 1);
  const scrap0 = s.resources.scrap;
  assert.equal(startCraft(s, ws.id, 'weapon').ok, true);
  assert.equal(s.resources.scrap, scrap0 - 15);
  assert.equal(canCraft(s, ws.id, 'weapon').reason, 'reason.crafting');
  ticks(s, 300);
  assert.ok(s.survivors.every((v) => !v.weapon), '근무자 없으면 진행 안 됨');
  assignWorker(s, bySpec(s, 'tech').id, ws.id);
  ticks(s, secTicks(30 / 1.5));
  const armed = s.survivors.filter((v) => v.weapon);
  assert.equal(armed.length, 1);
  assert.equal(armed[0].specialty, 'combat');
});

test('길게 눌러 옮기기: 방 → 다른 방, 자리가 없으면 원래대로', () => {
  const s = createState(24);
  rich(s);
  const [a, b, c] = notSpec(s, 'tech', 3);
  assignWorker(s, a.id, gen(s).id);
  assignWorker(s, b.id, gen(s).id);
  assignWorker(s, c.id, water(s).id);
  assert.equal(moveSurvivor(s, c.id, gen(s).id).reason, 'reason.full');
  assert.equal(c.job, 'room');
  assert.equal(c.jobRef, water(s).id, '실패하면 그대로');
  assert.equal(moveSurvivor(s, a.id, water(s).id).ok, true);
  assert.equal(workersOf(s, water(s).id).length, 2);
  assert.equal(s.power.produced, 6);
  debugDig(s, 2, SC + 1);
  const st = startBuild(s, 'storage', 2, SC + 1);
  assert.equal(moveSurvivor(s, b.id, st.id).ok, true, '공사로도 옮길 수 있다');
  assert.equal(buildersOf(s, st.id).length, 1);
});

test('벙커 진행(공사 중·근무·제작)이 저장·복원되고, v2 저장은 최신 버전으로 올라간다', () => {
  const s = createState(25);
  rich(s);
  const d = startDig(s, 2, SC + 1);
  assignBuilder(s, s.survivors[0].id, d.id);
  assignWorker(s, s.survivors[1].id, gen(s).id);
  ticks(s, 30);
  const r = deserialize(serialize(s));
  assert.deepEqual(r.bunker, s.bunker);
  ticks(r, 70);
  assert.equal(isDug(r, 2, SC + 1), true, '복원 후 굴착이 이어서 끝난다');

  const v2 = JSON.parse(serialize(createState(26)));
  v2.version = 2;
  delete v2.bunker; delete v2.door; delete v2.items;
  v2.survivors = v2.survivors.map(({ jobRef, ...rest }) => rest);
  const up = deserialize(JSON.stringify(v2));
  assert.ok(up);
  assert.equal(up.version, CONFIG.SAVE.VERSION);
  assert.equal(up.bunker.rooms.length, 4);
  assert.ok(up.survivors.every((v) => v.jobRef === null));
});
