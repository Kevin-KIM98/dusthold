// 일차별 미션 (plan v0.4 ⑥): 미션 카드 내용, 그리고 "필수 미션을 지키면 그 밤은 산다"는 보장
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../js/config.js';
import { createState, serialize, deserialize } from '../js/sim/state.js';
import { tick, DAY_TICKS, DAYLIGHT_TICKS, getDay, getTickInDay } from '../js/sim/time.js';
import { dayMissions, survivalMet, goalsFor } from '../js/sim/missions.js';
import { previewZombies, minDefense, simulateNight, nightForecast, defenseDps, getRaidSize, planNight } from '../js/sim/raid.js';
import { debugPlaceRoom, assignWorker } from '../js/sim/bunker.js';
import { makeSurvivor } from '../js/sim/survivors.js';
import { withRng } from '../js/sim/rng.js';
import { skipTutorial } from '../js/sim/tutorial.js';
import { missionModel } from '../js/render/viewModel.js';
import { playGame } from '../tools/bot.js';

const SC = CONFIG.BUNKER.SHAFT_COL;
const ticks = (s, n) => { for (let i = 0; i < n; i++) tick(s); };
// 다음 틱이 밤 시작. 시간을 건너뛰므로 그날 새벽에 하는 '오늘 밤 계획'도 해 준다
const toEve = (s, day) => { s.time.tick = (day - 1) * DAY_TICKS + DAYLIGHT_TICKS - 1; planNight(s, day); };
const clone = (s) => deserialize(serialize(s));

/** 경비 전투력 조합으로 만들 수 있는 화력 중 target 이상 최소(up) / 이하 최대(down) */
const POWERS = [5, 8, 10, 13]; // 일반, 전투 특기, 일반+무기, 전투+무기
function combo(target, up) {
  const best = new Map([[0, []]]);
  for (let k = 0; k < 8; k++) {
    for (const [sum, list] of [...best]) for (const p of POWERS) if (!best.has(sum + p) && list.length < 8) best.set(sum + p, [...list, p]);
  }
  const sums = [...best.keys()].sort((a, b) => a - b);
  const pick = up ? sums.find((v) => v >= target) : [...sums].reverse().find((v) => v <= target);
  return pick === undefined ? null : { dps: pick, list: best.get(pick) };
}

/** 경비실 4개(최대 8명)를 놓고 정확히 그 화력이 되게 경비를 세운다 */
function setDefense(s, list) {
  const rooms = [debugPlaceRoom(s, 'guard', 1, 0), debugPlaceRoom(s, 'guard', 1, 6), debugPlaceRoom(s, 'guard', 2, SC - 1), debugPlaceRoom(s, 'guard', 2, SC + 1)];
  withRng(s, (rng) => {
    for (let k = 0; k < 2; k++) { const g = makeSurvivor(s, rng, 'gather'); s.survivors.push(g); assignWorker(s, g.id, s.bunker.rooms.find((r) => r.type === 'generator').id); }
    list.forEach((p, k) => {
      const v = makeSurvivor(s, rng, p === 8 || p === 13 ? 'combat' : 'gather');
      v.weapon = p >= 10;
      s.survivors.push(v);
      assert.equal(assignWorker(s, v.id, rooms[k >> 1].id).ok, true);
    });
  });
  return defenseDps(s);
}

test('미션 카드: 필수(방어 화력·식량·물) + 오늘의 목표, 달성하면 표시', () => {
  const s = createState(301);
  skipTutorial(s);
  s.time.tick = DAY_TICKS + 100; // 2일차 낮
  const ms = dayMissions(s);
  const ids = ms.map((m) => m.id);
  assert.deepEqual(ids.filter((x) => !x.startsWith('goal')), ['defense', 'food', 'water']);
  assert.equal(ms.filter((m) => !m.survival).length, goalsFor(2).length);
  const def = ms.find((m) => m.id === 'defense');
  assert.ok(def.need > 0 && def.done === false, '경비가 없으면 방어 화력 미달');
  const m = missionModel(s);
  assert.equal(m.title, '2일차 미션');
  assert.ok(m.must[0].text.includes('방어 화력 0/'));
  assert.equal(m.allMust, false);
  // 수경재배실을 지으면 목표 달성 표시
  debugPlaceRoom(s, 'farm', 2, SC + 1);
  assert.equal(dayMissions(s).find((x) => x.goal && x.goal.room === 'farm').done, true);
  // 경비를 세우면 필수 달성
  const need = def.need;
  setDefense(s, combo(need, true).list);
  assert.equal(survivalMet(s), true);
  assert.equal(missionModel(s).allMust, true);
  // 가이드 중엔 미션 카드 대신 가이드
  const t = createState(302);
  assert.equal(missionModel(t), null);
});

test('목표는 일차마다 바뀌고 10일차부터는 무선실', () => {
  assert.equal(goalsFor(2)[0].room, 'farm');
  assert.equal(goalsFor(4)[0].kind, 'turret');
  assert.equal(goalsFor(10)[0].kind, 'radio');
  assert.equal(goalsFor(15)[0].kind, 'radio');
});

test('오늘 밤 좀비는 새벽에 미리 정해지고, 낮의 미리보기와 밤의 실제 습격이 같다', () => {
  const s = createState(303);
  skipTutorial(s);
  ticks(s, DAY_TICKS + 10); // 2일차 새벽 지나서
  assert.equal(s.nightPlan.day, 2);
  const pre = previewZombies(s, 2);
  toEve(s, 2);
  tick(s);
  assert.deepEqual(s.raid.zombies.map((z) => [z.type, z.hp, z.arrive]), pre.map((z) => [z.type, z.hp, z.arrive]));
  assert.equal(s.raid.size, getRaidSize(s, 2));
});

test('⑥ 보장 1 — 필요 방어 화력 계산이 실제 습격과 정확히 맞는다 (이상이면 버티고, 모자라면 부서진다)', () => {
  let checked = 0;
  for (const seed of [11, 12, 13, 14, 15, 16]) {
    for (const day of [2, 3, 4, 5, 6]) {
      const base = createState(seed * 100 + day);
      skipTutorial(base);
      Object.assign(base.resources, { food: 150, water: 150 });
      toEve(base, day);
      const req = minDefense(previewZombies(base, day), base.door.hp, false);
      if (req === 0 || req === Infinity) continue;
      const hold = combo(req, true);
      const weak = combo(req - 1, false);
      for (const [c, expectBreach] of [[hold, false], [weak, true]]) {
        if (!c) continue;
        const s = clone(base);
        const dps = setDefense(s, c.list);
        assert.equal(dps, c.dps);
        tick(s); // 밤 시작
        assert.equal(s.raid.requiredDps, req, '밤 시작 때 계산한 기준도 같다');
        let breached = false;
        for (let i = 0; i < DAY_TICKS - DAYLIGHT_TICKS - 1; i++) { tick(s); breached = breached || s.raid.breached; }
        assert.equal(breached, expectBreach, `seed ${seed} ${day}일차: 필요 ${req}, 화력 ${dps} → ${expectBreach ? '부서져야' : '버텨야'} 함`);
        checked++;
      }
    }
  }
  assert.ok(checked >= 30, `확인한 밤 ${checked}개`);
});

test('⑥ 보장 2 — 자동 플레이 20판의 모든 밤: 필수 미션을 지킨 채 맞은 밤엔 문이 안 부서지고 아무도 안 굶었다', () => {
  let safeNights = 0, riskyNights = 0, violations = [];
  for (let k = 1; k <= 20; k++) {
    let night = null;
    playGame(2000 + k, 14, {
      onTick(s) {
        const inDay = getTickInDay(s);
        if (inDay === DAYLIGHT_TICKS) {
          night = { day: getDay(s), met: survivalMet(s), minDps: defenseDps(s), req: s.raid.requiredDps, breached: false, foodOk: true };
        } else if (night && inDay > DAYLIGHT_TICKS) {
          night.minDps = Math.min(night.minDps, defenseDps(s));
          night.breached = night.breached || s.raid.breached;
          if (inDay === DAY_TICKS - 1) {
            const n = s.survivors.length;
            night.foodOk = s.resources.food >= n * CONFIG.SURVIVOR.FOOD_PER_DAY && s.resources.water >= n * CONFIG.SURVIVOR.WATER_PER_DAY;
          }
        } else if (night && inDay === 1) {
          const starved = s.log.some((e) => e.key === 'log.starve' && Math.floor(e.tick / DAY_TICKS) + 1 === night.day + 1);
          const kept = night.met && night.minDps >= night.req && night.foodOk; // 밤새 지킨 경우
          if (kept) {
            safeNights++;
            if (night.breached || starved) violations.push({ seed: 2000 + k, ...night, starved });
          } else riskyNights++;
          night = null;
        }
      },
    });
  }
  assert.deepEqual(violations, [], '미션을 지킨 밤에 죽을 일이 생기면 안 된다');
  assert.ok(safeNights >= 30, `미션을 지킨 밤 ${safeNights}개 (못 지킨 밤 ${riskyNights}개)`);
});

test('예보: 문을 강화하면 필요 화력이 줄고, 연습 날엔 필요 없다', () => {
  const s = createState(305);
  skipTutorial(s);
  s.time.tick = 100;
  assert.equal(nightForecast(s).required, 0, '1일차 연습 습격');
  s.time.tick = 4 * DAY_TICKS + 100; // 5일차 (대규모)
  const r1 = nightForecast(s).required;
  s.door.level = 3;
  s.door.hp = 1000;
  const r3 = nightForecast(s).required;
  assert.ok(r3 < r1, `Lv1 ${r1} → Lv3 ${r3}`);
  const zs = previewZombies(s, 5);
  assert.equal(simulateNight(zs, 1000, r3, false).breached, false);
});

test('저장: v6 저장은 v7로 올라가며 오늘 밤 계획이 생긴다', () => {
  const v6 = JSON.parse(serialize(createState(306)));
  v6.version = 6;
  delete v6.nightPlan;
  const up = deserialize(JSON.stringify(v6));
  assert.ok(up);
  assert.equal(up.version, CONFIG.SAVE.VERSION);
  assert.equal(up.nightPlan.day, 1);
});
