// M2 지상 완료 기준 7개 + 맵 생성 규칙 (plan.md ① 지상 타일, ⑥ 지상)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../js/config.js';
import { createState, serialize, deserialize } from '../js/sim/state.js';
import { tick, DAYLIGHT_TICKS, isNight } from '../js/sim/time.js';
import {
  generateMap, tileIndex, centerIndex, neighbors, canExplore, canAttack, canGather,
  startExpedition, assignGatherer, unassign, requiredPower, partyPower,
} from '../js/sim/surface.js';
import { getRaidSize, activeNestCount } from '../js/sim/raid.js';
import { withRng } from '../js/sim/rng.js';
import { makeSurvivor } from '../js/sim/survivors.js';
import { assignWorker, debugPlaceRoom } from '../js/sim/bunker.js';

const S = CONFIG.SURFACE;
const TICK = CONFIG.TIME.TICK_SEC;
const ticks = (state, n) => { for (let i = 0; i < n; i++) tick(state); };
const ids = (state, n) => state.survivors.slice(0, n).map((s) => s.id);
const idx = (state, x, y) => tileIndex(state.surface.size, x, y);

/** 테스트용: 특정 칸의 종류를 바꾼다 */
function setTile(state, i, type, extra) {
  const t = state.surface.tiles[i];
  t.type = type;
  t.deposit = S.TILES[type].gather ? S.TILES[type].deposit : null;
  t.cleared = false;
  Object.assign(t, extra || {});
  return t;
}

// ---------- 맵 생성 ----------
test('맵: 11×11, 중앙 입구, 같은 시드 = 같은 맵, 다른 시드 = 다른 맵', () => {
  const a = generateMap(1), b = generateMap(1), c = generateMap(2);
  assert.equal(a.tiles.length, 121);
  assert.equal(a.tiles[centerIndex(11)].type, 'entrance');
  assert.deepEqual(a.tiles.map((t) => t.type), b.tiles.map((t) => t.type));
  assert.notDeepEqual(a.tiles.map((t) => t.type), c.tiles.map((t) => t.type));
});

test('맵: 군 기지는 링 4~5에 정확히 1곳, 타일은 등장 링을 지킨다 (시드 200개)', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const m = generateMap(seed);
    const bases = m.tiles.filter((t) => t.type === 'base');
    assert.equal(bases.length, 1, `seed ${seed}`);
    assert.ok(bases[0].ring >= 4 && bases[0].ring <= 5);
    for (const t of m.tiles) {
      if (t.type === 'entrance') { assert.equal(t.ring, 0); continue; }
      assert.ok(t.ring >= S.TILES[t.type].minRing, `seed ${seed}: ${t.type} 링 ${t.ring}`);
    }
  }
});

test('맵: 매장량은 config대로, 저수지는 무한', () => {
  const m = generateMap(5);
  for (const t of m.tiles) {
    if (['forest', 'ruins', 'farm'].includes(t.type)) assert.equal(t.deposit, S.TILES[t.type].deposit);
    if (t.type === 'reservoir') assert.equal(t.deposit, null);
  }
});

// ---------- ⑥-1 ----------
test('⑥ 시작 시 입구 주변 8칸만 밝혀져 있고 나머지는 안개다 (숲·폐허·농지 보장)', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const s = createState(seed);
    const revealed = s.surface.tiles.filter((t) => t.revealed);
    assert.equal(revealed.length, 9, '입구 + 8칸');
    for (const t of s.surface.tiles) assert.equal(t.revealed, t.ring <= 1);
    const ring1 = s.surface.tiles.filter((t) => t.ring === 1).map((t) => t.type);
    for (const need of ['forest', 'ruins', 'farm']) assert.ok(ring1.includes(need), `seed ${seed}: ${need} 없음`);
  }
});

// ---------- ⑥-2 ----------
test('⑥ 밝혀진 타일에 인접한 안개 타일만 탐험할 수 있다', () => {
  const s = createState(3);
  const n = s.surface.size;
  for (let i = 0; i < n * n; i++) {
    const t = s.surface.tiles[i];
    const adj = neighbors(n, i).some((j) => s.surface.tiles[j].revealed);
    const r = canExplore(s, i);
    if (t.revealed) assert.equal(r.reason, 'reason.notFog');
    else if (adj) assert.equal(r.ok, true, `칸 ${i}는 탐험 가능해야 함`);
    else assert.equal(r.reason, 'reason.notAdjacent');
  }
  // 링 2는 전부 가능, 링 3은 시작 시 전부 불가
  assert.ok(s.surface.tiles.every((t, i) => t.ring !== 2 || canExplore(s, i).ok));
  assert.ok(s.surface.tiles.every((t, i) => t.ring !== 3 || !canExplore(s, i).ok));
  // 불가능한 칸으로 출발 시도 → 거부, 아무도 안 나감
  const far = idx(s, 5, 1); // 링 4
  const r = startExpedition(s, far, ids(s, 1), 'explore');
  assert.equal(r.ok, false);
  assert.equal(s.surface.expeditions.length, 0);
  assert.ok(s.survivors.every((v) => v.job === 'rest'));
});

test('원정대 인원: 1~3명, 쉬는 사람만, 같은 칸에 중복 원정 불가', () => {
  const s = createState(3);
  const i = idx(s, 5, 3);
  assert.equal(startExpedition(s, i, [], 'explore').reason, 'reason.noMembers');
  const four = ids(s, 4);
  assert.equal(startExpedition(s, i, four, 'explore').reason, 'reason.tooMany');
  assert.equal(startExpedition(s, i, ids(s, 1), 'explore').ok, true);
  assert.equal(startExpedition(s, i, [s.survivors[1].id], 'explore').reason, 'reason.busy');
  assert.equal(startExpedition(s, idx(s, 4, 3), [s.survivors[0].id], 'explore').reason, 'reason.unavailable', '원정 중인 사람은 못 보냄');
  s.survivors[2].hp = 30; // 부상
  assert.equal(startExpedition(s, idx(s, 4, 3), [s.survivors[2].id], 'explore').reason, 'reason.unavailable', '부상자는 못 보냄');
});

// ---------- ⑥-3 ----------
test('⑥ 원정대를 보내면 링 거리×20초 후 귀환하며 타일이 밝혀지고 보상이 들어온다', () => {
  for (const [x, y, ring] of [[5, 3, 2], [3, 3, 2]]) {
    const s = createState(11);
    const i = idx(s, x, y);
    setTile(s, i, 'forest');
    const wood0 = s.resources.wood;
    const team = ids(s, 2);
    assert.equal(startExpedition(s, i, team, 'explore').ok, true);
    assert.ok(team.every((id) => s.survivors.find((v) => v.id === id).job === 'expedition'));
    const total = Math.round((S.EXPEDITION_SEC_PER_RING * ring) / TICK); // 40초 = 400틱
    ticks(s, total - 1);
    assert.equal(s.surface.tiles[i].revealed, false, '1틱 전엔 아직 안개');
    assert.equal(s.resources.wood, wood0);
    ticks(s, 1);
    assert.equal(s.surface.tiles[i].revealed, true, `${ring * 20}초에 밝혀짐`);
    assert.equal(s.resources.wood, wood0 + 15, '숲 탐험 보상 목재 15');
    assert.equal(s.surface.expeditions.length, 0);
    assert.ok(team.every((id) => s.survivors.find((v) => v.id === id).job === 'rest'), '귀환 후 휴식');
    assert.ok(s.log.some((e) => e.key === 'log.exploreDone'));
    assert.ok(s.events.some((e) => e.key === 'toast.returned'));
  }
});

test('탐험 보상: 폐허·농지·저수지는 config 보상, 상자 20~40, 캠프 생존자 1~2', () => {
  const s = createState(12);
  const rw = (type, res) => S.TILES[type].reward[res];
  const cases = [['ruins', 'scrap', rw('ruins', 'scrap'), 5, 3], ['farm', 'food', rw('farm', 'food'), 7, 5], ['reservoir', 'water', rw('reservoir', 'water'), 3, 5]];
  for (const [type, res, n, x, y] of cases) {
    const i = idx(s, x, y);
    setTile(s, i, type);
    const before = s.resources[res];
    startExpedition(s, i, ids(s, 1), 'explore');
    ticks(s, 400);
    assert.equal(s.resources[res], before + n, type);
  }
  // 보급 상자
  const bi = idx(s, 3, 7);
  setTile(s, bi, 'box');
  const sum0 = s.resources.food + s.resources.water + s.resources.wood + s.resources.scrap;
  startExpedition(s, bi, ids(s, 1), 'explore');
  ticks(s, 400);
  const gained = s.resources.food + s.resources.water + s.resources.wood + s.resources.scrap - sum0;
  assert.ok(gained >= 20 && gained <= 40, `상자 ${gained}`);
  assert.equal(s.surface.tiles[bi].cleared, true, '상자는 1회성');
  // 생존자 캠프
  const ci = idx(s, 7, 7);
  setTile(s, ci, 'camp');
  const pop0 = s.survivors.length;
  startExpedition(s, ci, ids(s, 1), 'explore');
  ticks(s, 400);
  const added = s.survivors.length + s.waiting.length - pop0;
  assert.ok(added >= 1 && added <= 2, `캠프 +${added}`);
  assert.equal(s.surface.tiles[ci].cleared, true);
});

test('캠프: 인구 상한을 넘는 생존자는 입구에서 대기, 숙소가 생기면 입주', () => {
  const s = createState(13);
  // 인구 6/6으로 채운다
  withRng(s, (rng) => { while (s.survivors.length < s.popCap) s.survivors.push(makeSurvivor(s, rng)); });
  const ci = idx(s, 5, 3);
  setTile(s, ci, 'camp');
  startExpedition(s, ci, ids(s, 1), 'explore');
  ticks(s, 400);
  assert.equal(s.survivors.length, 6);
  assert.ok(s.waiting.length >= 1);
  const w = s.waiting.length;
  // 숙소(M3)를 짓고 발전실에 사람을 넣어 전력을 켠다
  const gen = s.bunker.rooms.find((r) => r.type === 'generator');
  assignWorker(s, s.survivors[1].id, gen.id);
  debugPlaceRoom(s, 'quarters', 2, 4);
  assert.equal(s.popCap, 10);
  ticks(s, 1);
  assert.equal(s.waiting.length, 0);
  assert.equal(s.survivors.length, 6 + w);
  assert.equal(new Set(s.survivors.map((v) => v.name)).size, s.survivors.length, '이름 중복 없음');
});

test('저장 상한 150: 넘치는 보상은 버려진다', () => {
  const s = createState(14);
  s.resources.wood = 145;
  const i = idx(s, 5, 3);
  setTile(s, i, 'forest');
  startExpedition(s, i, ids(s, 1), 'explore');
  ticks(s, 400);
  assert.equal(s.resources.wood, 150);
});

// ---------- ⑥-4 ----------
test('⑥ 숲·폐허·농지에 생존자를 배치하면 낮 동안 자원이 쌓이고 매장량이 줄어든다', () => {
  for (const [type, res] of [['forest', 'wood'], ['ruins', 'scrap'], ['farm', 'food']]) {
    const perDay = S.TILES[type].gather.perDay;
    const s = createState(21);
    const i = s.surface.tiles.findIndex((t) => t.type === type && t.revealed);
    assert.ok(i >= 0, type + ' 시작 8칸에 있음');
    const dep0 = s.surface.tiles[i].deposit;
    const r0 = s.resources[res];
    // 채집 특기가 아닌 2명
    const workers = s.survivors.filter((v) => v.specialty !== 'gather').slice(0, 2);
    for (const w of workers) assert.equal(assignGatherer(s, w.id, i).ok, true);
    ticks(s, 1200); // 120초 = 반나절
    const expected = Math.floor(perDay * 2 * (120 / CONFIG.TIME.DAY_SEC));
    const got = s.resources[res] - r0;
    assert.ok(Math.abs(got - expected) <= 1, `${type}: ${got} (기대 ${expected})`);
    assert.equal(s.surface.tiles[i].deposit, dep0 - got, '매장량이 같은 양만큼 줄어듦');
  }
});

test('채집 특기는 +50%, 빼기 하면 멈춘다', () => {
  const s = createState(22);
  const i = s.surface.tiles.findIndex((t) => t.type === 'forest' && t.revealed);
  const g = s.survivors.find((v) => v.specialty === 'gather');
  assignGatherer(s, g.id, i);
  const w0 = s.resources.wood;
  ticks(s, 1600); // 160초
  const got = s.resources.wood - w0;
  const expected = Math.floor(S.TILES.forest.gather.perDay * (1 + S.GATHER_SPECIALTY_BONUS) * (160 / CONFIG.TIME.DAY_SEC));
  assert.ok(Math.abs(got - expected) <= 1, `특기 ${got} (기대 ${expected})`);
  assert.equal(unassign(s, g.id).ok, true);
  const w1 = s.resources.wood;
  ticks(s, 100);
  assert.equal(s.resources.wood, w1);
});

test('매장량이 바닥나면 채집 인원이 돌아오고 더 배치할 수 없다', () => {
  const s = createState(23);
  const i = s.surface.tiles.findIndex((t) => t.type === 'ruins' && t.revealed);
  s.surface.tiles[i].deposit = 2;
  for (const v of s.survivors.slice(0, 3)) assignGatherer(s, v.id, i);
  ticks(s, 600);
  assert.equal(s.surface.tiles[i].deposit, 0);
  assert.ok(s.survivors.every((v) => v.job === 'rest'));
  assert.equal(canGather(s, i).reason, 'reason.exhausted');
  assert.ok(s.log.some((e) => e.key === 'log.exhausted'));
});

test('저수지는 무한, 안개·전투 칸·밤에는 배치 불가', () => {
  const s = createState(24);
  const ri = idx(s, 6, 6);
  setTile(s, ri, 'reservoir');
  assignGatherer(s, s.survivors[0].id, ri);
  ticks(s, 1000);
  assert.equal(s.surface.tiles[ri].deposit, null);
  assert.ok(s.resources.water > 20);
  assert.equal(canGather(s, idx(s, 5, 2)).reason, 'reason.notRevealed');
  const ni = idx(s, 4, 4);
  setTile(s, ni, 'nest');
  assert.equal(canGather(s, ni).reason, 'reason.notGatherable');
  ticks(s, DAYLIGHT_TICKS - s.time.tick);
  assert.equal(isNight(s), true);
  const fi = s.surface.tiles.findIndex((t) => t.type === 'forest' && t.revealed);
  assert.equal(assignGatherer(s, s.survivors[1].id, fi).reason, 'reason.night');
});

// ---------- ⑥-5 ----------
test('⑥ 밤이 되면 지상 채집 인원이 자동 귀환한다', () => {
  const s = createState(31);
  const fi = s.surface.tiles.findIndex((t) => t.type === 'forest' && t.revealed);
  const ui = s.surface.tiles.findIndex((t) => t.type === 'ruins' && t.revealed);
  assignGatherer(s, s.survivors[0].id, fi);
  assignGatherer(s, s.survivors[1].id, ui);
  ticks(s, DAYLIGHT_TICKS - 1);
  assert.equal(s.survivors.filter((v) => v.job === 'gather').length, 2, '밤 직전엔 아직 채집 중');
  ticks(s, 1);
  assert.equal(isNight(s), true);
  assert.equal(s.survivors.filter((v) => v.job === 'gather').length, 0, '밤이 되자 전원 귀환');
  assert.ok(s.log.some((e) => e.key === 'log.gatherersReturn' && e.params.n === 2));
  const w = s.resources.wood;
  ticks(s, 300);
  assert.equal(s.resources.wood, w, '밤엔 채집 안 됨');
});

// ---------- ⑥-6 ----------
test('⑥ 둥지: 전투력이 부족하면 전원 부상 귀환, 충분하면 클리어되고 다음 습격 마릿수가 줄어든다', () => {
  const s = createState(41);
  // 링 2 이하 둥지를 없애고, 링 2에 둥지 하나를 둔다 (필요 전투력 20)
  for (const t of s.surface.tiles) if (t.type === 'nest') { t.type = 'forest'; t.deposit = 120; }
  const ni = idx(s, 5, 3);
  setTile(s, ni, 'nest', { revealed: true });
  assert.equal(requiredPower(s.surface.tiles[ni]), 20);
  assert.equal(activeNestCount(s), 1);
  const day = 2;
  const before = getRaidSize(s, day);
  assert.equal(before, 4 + 2 * (day - 1) + 2 * 1);

  // 1) 부족: 일반 2명 = 10 < 20
  const weak = s.survivors.filter((v) => v.specialty !== 'combat').slice(0, 2).map((v) => v.id);
  assert.equal(partyPower(s, weak), 10);
  assert.equal(startExpedition(s, ni, weak, 'attack').ok, true);
  ticks(s, 400);
  for (const id of weak) assert.ok(s.survivors.find((v) => v.id === id).hp <= CONFIG.SURVIVOR.INJURED_HP, '부상');
  assert.equal(s.surface.tiles[ni].cleared, false);
  assert.equal(getRaidSize(s, day), before, '실패하면 마릿수 그대로');
  assert.ok(s.log.some((e) => e.key === 'log.attackFailed'));
  assert.ok(s.events.some((e) => e.key === 'toast.attackFailed'));

  // 2) 충분: 다쳤던 사람 회복시키고 전투 8 + 일반 5 + 일반 5 + 무기 → 23 이상
  for (const v of s.survivors) v.hp = 100;
  const strong = s.survivors.slice(0, 3);
  strong[0].weapon = true;
  const team = strong.map((v) => v.id);
  const power = partyPower(s, team);
  assert.ok(power >= 20, `전투력 ${power}`);
  const scrap0 = s.resources.scrap;
  assert.equal(startExpedition(s, ni, team, 'attack').ok, true);
  ticks(s, 400);
  assert.equal(s.surface.tiles[ni].cleared, true, '클리어');
  assert.equal(s.resources.scrap, scrap0 + 30, '둥지 보상 고철 30');
  assert.equal(getRaidSize(s, day), before - 2, '다음 습격 마릿수 -2');
  assert.equal(canAttack(s, ni).reason, 'reason.cleared');
});

test('둥지 격전: 이겼어도 여유가 요구치의 50% 미만이면 1명 체력 -20, 넉넉하면 무사', () => {
  const s = createState(42);
  const ni = idx(s, 5, 3);
  setTile(s, ni, 'nest', { revealed: true }); // 필요 20
  // 전투력 정확히 20~29 → 격전
  const team = s.survivors.slice(0, 3);
  team.forEach((v) => { v.specialty = 'gather'; v.weapon = false; });
  team[0].weapon = true; // 10 + 5 + 5 = 20
  startExpedition(s, ni, team.map((v) => v.id), 'attack');
  ticks(s, 400);
  assert.equal(s.surface.tiles[ni].cleared, true);
  const hurt = team.filter((v) => v.hp === 80);
  assert.equal(hurt.length, 1, '정확히 1명 -20');

  const s2 = createState(43);
  const n2 = idx(s2, 5, 3);
  setTile(s2, n2, 'nest', { revealed: true, ring: 1 }); // 테스트용: 필요 10
  const t2 = s2.survivors.slice(0, 3);
  t2.forEach((v) => { v.weapon = true; }); // 30 이상 ≥ 15
  startExpedition(s2, n2, t2.map((v) => v.id), 'attack');
  ticks(s2, 400);
  assert.ok(t2.every((v) => v.hp === 100), '넉넉하면 아무도 안 다침');
});

test('습격 마릿수 공식: 링 3 밖 둥지는 세지 않고, 5일차는 1.5배, 최대 40', () => {
  const s = createState(44);
  for (const t of s.surface.tiles) if (t.type === 'nest') { t.type = 'forest'; }
  assert.equal(getRaidSize(s, 1), 4);
  assert.equal(getRaidSize(s, 4), 10);
  assert.equal(getRaidSize(s, 5), Math.round(12 * 1.5));
  setTile(s, idx(s, 5, 0), 'nest'); // 링 5
  assert.equal(getRaidSize(s, 1), 4, '링 5 둥지는 영향 없음');
  setTile(s, idx(s, 5, 2), 'nest'); // 링 3
  assert.equal(getRaidSize(s, 1), 6);
  assert.equal(getRaidSize(s, 30), 40);
});

// ---------- ⑥-7 ----------
test('⑥ 군 기지를 클리어하면 통신부품 1개를 얻는다', () => {
  const s = createState(51);
  const bi = s.surface.tiles.findIndex((t) => t.type === 'base');
  const base = s.surface.tiles[bi];
  base.revealed = true;
  assert.equal(requiredPower(base), 35, '기획서 v0.1.1 요구 전투력');
  const ticksTo = Math.round((S.EXPEDITION_SEC_PER_RING * base.ring) / TICK);
  assert.ok(base.ring >= 4 && base.ring <= 5);
  const team = s.survivors.slice(0, 3);

  // 1) 전투력 부족(전투 특기 1 + 일반 2, 전원 무기 = 33 < 35): 부상 귀환, 통신부품 없음
  team.forEach((v, k) => { v.specialty = k === 0 ? 'combat' : 'gather'; v.weapon = true; });
  assert.equal(partyPower(s, team.map((v) => v.id)), 33);
  startExpedition(s, bi, team.map((v) => v.id), 'attack');
  ticks(s, ticksTo);
  assert.equal(s.resources.parts, 0);
  assert.equal(base.cleared, false);
  assert.ok(team.every((v) => v.hp <= CONFIG.SURVIVOR.INJURED_HP));

  // 2) 전투 특기 2 + 일반 1, 전원 무기 = 36 ≥ 35: 통신부품 +1, 고철 +40
  for (const v of s.survivors) v.hp = 100;
  team[1].specialty = 'combat';
  assert.equal(partyPower(s, team.map((v) => v.id)), 36);
  const scrap0 = s.resources.scrap;
  assert.equal(startExpedition(s, bi, team.map((v) => v.id), 'attack').ok, true);
  ticks(s, ticksTo);
  assert.equal(base.cleared, true);
  assert.equal(s.resources.parts, 1, '통신부품 1개');
  assert.equal(s.resources.scrap, Math.min(150, scrap0 + 40));
  assert.ok(s.log.some((e) => e.key === 'log.baseCleared'));
  assert.equal(canAttack(s, bi).reason, 'reason.cleared', '두 번 얻을 수 없다');
});

// ---------- 저장 ----------
test('지상 진행(밝힌 칸·원정 중·채집 중·대기열)이 저장·복원된다', () => {
  const s = createState(61);
  const i = idx(s, 5, 3);
  startExpedition(s, i, ids(s, 1), 'explore');
  const fi = s.surface.tiles.findIndex((t) => t.type === 'forest' && t.revealed);
  assignGatherer(s, s.survivors[1].id, fi);
  ticks(s, 150);
  const r = deserialize(serialize(s));
  assert.ok(r);
  assert.deepEqual(r.surface, s.surface);
  assert.deepEqual(r.survivors, s.survivors);
  ticks(r, 250);
  assert.equal(r.surface.tiles[i].revealed, true, '복원 후에도 원정이 이어서 끝난다');
});

test('M1(v1) 저장은 v2로 올라가며 시드로 같은 맵을 만든다', () => {
  const s = createState(71);
  const v1 = JSON.parse(serialize(s));
  v1.version = 1;
  delete v1.surface; delete v1.waiting; delete v1.nextSurvivorId;
  v1.survivors = v1.survivors.map(({ jobTile, weapon, ...rest }) => rest);
  const r = deserialize(JSON.stringify(v1));
  assert.ok(r, 'v1 저장도 불러온다');
  assert.equal(r.version, CONFIG.SAVE.VERSION);
  assert.deepEqual(r.surface.tiles.map((t) => t.type), s.surface.tiles.map((t) => t.type));
  assert.equal(r.nextSurvivorId, 5);
  assert.ok(r.survivors.every((v) => v.weapon === false && v.jobTile === null));
});
