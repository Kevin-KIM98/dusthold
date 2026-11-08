// 1일차 가이드·연습 습격 (plan v0.3 ⑥ 튜토리얼)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../js/config.js';
import { createState, serialize, deserialize } from '../js/sim/state.js';
import { tick, DAY_TICKS, DAYLIGHT_TICKS, isNight } from '../js/sim/time.js';
import { TUTORIAL_STEPS, currentStep, isTutorialActive, skipTutorial } from '../js/sim/tutorial.js';
import { assignWorker, startDig, startBuild, assignBuilder, roomAt, isDug } from '../js/sim/bunker.js';
import { startExpedition, assignGatherer, tileIndex } from '../js/sim/surface.js';
import { isAvailable } from '../js/sim/survivors.js';
import { tutorialModel } from '../js/render/viewModel.js';

const TU = CONFIG.TUTORIAL;
const ticks = (s, n) => { for (let i = 0; i < n; i++) tick(s); };
const idle = (s, pref) => s.survivors.filter(isAvailable).sort((a, b) => (b.specialty === pref) - (a.specialty === pref))[0];
const room = (s, type) => s.bunker.rooms.find((r) => r.type === type);

/** 가이드대로 한 단계를 한다 (시작 자원만으로). 기다려야 하면 틱을 돌린다 */
function doStep(s, step) {
  const D = TU.DIG_CELL;
  if (step === 'gen') assert.equal(assignWorker(s, idle(s, 'tech').id, room(s, 'generator').id).ok, true);
  if (step === 'water') assert.equal(assignWorker(s, idle(s, 'tech').id, room(s, 'water').id).ok, true);
  if (step === 'dig') {
    const d = startDig(s, D.floor, D.col);
    assert.equal(d.ok, true, '목재 5로 굴착');
    assert.equal(assignBuilder(s, idle(s, 'build').id, d.id).ok, true);
  }
  if (step === 'explore') {
    const tile = tileIndex(s.surface.size, TU.EXPLORE_TILE.x, TU.EXPLORE_TILE.y);
    assert.equal(startExpedition(s, tile, [idle(s, 'gather').id], 'explore').ok, true);
  }
  if (step === 'guard') {
    let n = 0;
    while (!isDug(s, D.floor, D.col) && n++ < 400) tick(s); // 굴착이 끝나길 기다림
    const b = startBuild(s, 'guard', D.floor, D.col);
    assert.equal(b.ok, true, '고철 20으로 경비실');
    assert.equal(assignBuilder(s, idle(s, 'build').id, b.id).ok, true);
  }
  if (step === 'guardman') {
    let n = 0;
    while (!room(s, 'guard').done && n++ < 400) tick(s);
    let v = idle(s, 'combat');
    let w = 0;
    while (!v && w++ < 600) { tick(s); v = idle(s, 'combat'); } // 원정대가 돌아오길
    assert.equal(assignWorker(s, v.id, room(s, 'guard').id).ok, true);
  }
  if (step === 'gather') {
    let v = idle(s, 'gather');
    let w = 0;
    while (!v && w++ < 600) { tick(s); v = idle(s, 'gather'); }
    const ruins = s.surface.tiles.findIndex((t) => t.type === 'ruins' && t.revealed);
    assert.equal(assignGatherer(s, v.id, ruins).ok, true);
  }
  tick(s);
}

test('⑥ 새 게임: 1일차 가이드 7단계가 순서대로, 하면 자동으로 넘어간다 — 시작 자원만으로 첫날 낮 안에 끝난다', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const s = createState(seed);
    assert.equal(isTutorialActive(s), true);
    assert.deepEqual([...TUTORIAL_STEPS], ['gen', 'water', 'dig', 'explore', 'guard', 'guardman', 'gather']);
    for (let k = 0; k < TUTORIAL_STEPS.length; k++) {
      const step = TUTORIAL_STEPS[k];
      assert.equal(currentStep(s), step, `seed ${seed}: ${k + 1}단계`);
      const m = tutorialModel(s);
      assert.equal(m.title, `1일차 가이드 ${k + 1}/7`);
      assert.ok(m.body.length > 0);
      doStep(s, step);
      if (k < TUTORIAL_STEPS.length - 1) assert.ok(s.events.some((e) => e.key === 'toast.tutorialStep' && e.params.n === k + 1), '잘했어요 토스트');
    }
    assert.equal(s.tutorial.done, true);
    assert.equal(tutorialModel(s), null, '끝나면 카드 없음');
    assert.ok(s.events.some((e) => e.key === 'toast.tutorialDone'));
    assert.ok(!isNight(s) && s.time.tick < DAYLIGHT_TICKS, `seed ${seed}: 첫날 낮 안에 끝 (${(s.time.tick / 10).toFixed(0)}초)`);
    assert.ok(room(s, 'guard').done && room(s, 'generator').on, '경비실 완공·전력 들어옴');
  }
});

test('가이드: 가리키는 곳 — 벙커 발전실·정수실·굴착 칸, 지상 점선 칸·폐허', () => {
  const s = createState(7);
  assert.deepEqual(tutorialModel(s).target, { view: 'bunker', cell: { floor: 1, col: 1 } }, '발전실');
  doStep(s, 'gen');
  assert.deepEqual(tutorialModel(s).target, { view: 'bunker', cell: { floor: 1, col: 4 } }, '정수실');
  doStep(s, 'water');
  assert.deepEqual(tutorialModel(s).target, { view: 'bunker', cell: { ...TU.DIG_CELL } });
  doStep(s, 'dig');
  const t = tutorialModel(s).target;
  assert.equal(t.view, 'surface');
  assert.equal(t.tile, tileIndex(11, TU.EXPLORE_TILE.x, TU.EXPLORE_TILE.y));
  doStep(s, 'explore');
  assert.ok(tutorialModel(s).extra.includes('굴착이 끝나면'), '굴착 중이면 기다리라고 안내');
});

test('가이드: 미리 해 둔 단계는 그 차례가 오면 바로 넘어간다', () => {
  const s = createState(8);
  const d = startDig(s, TU.DIG_CELL.floor, TU.DIG_CELL.col); // 3단계를 먼저
  assignBuilder(s, s.survivors[0].id, d.id);
  tick(s);
  assert.equal(currentStep(s), 'gen');
  assignWorker(s, s.survivors[1].id, room(s, 'generator').id);
  assignWorker(s, s.survivors[2].id, room(s, 'water').id);
  tick(s);
  assert.equal(currentStep(s), 'explore', '1·2단계 후 3단계(굴착)는 이미 함 → 4단계');
});

test('가이드 건너뛰기, 저장·복원, 예전(v5) 저장은 가이드 없이', () => {
  const s = createState(9);
  assert.equal(skipTutorial(s), true);
  assert.equal(isTutorialActive(s), false);
  assert.equal(tutorialModel(s), null);
  assert.ok(s.log.some((e) => e.key === 'log.tutorialSkipped'));
  const r = deserialize(serialize(s));
  assert.equal(r.tutorial.skipped, true);

  const s2 = createState(10);
  doStep(s2, 'gen');
  const r2 = deserialize(serialize(s2));
  assert.equal(currentStep(r2), 'water', '진행 단계가 저장된다');

  const v5 = JSON.parse(serialize(createState(11)));
  v5.version = 5;
  delete v5.tutorial;
  const up = deserialize(JSON.stringify(v5));
  assert.ok(up);
  assert.equal(up.version, CONFIG.SAVE.VERSION);
  assert.equal(isTutorialActive(up), false, '하던 게임엔 가이드가 안 뜬다');
});

test('⑥ 1일차 밤은 좀비 2마리 연습 습격이고 방폭문이 부서지지 않는다', () => {
  const s = createState(12);
  // 둥지가 있어도 2마리
  const t3 = s.surface.tiles.findIndex((t) => t.ring === 3);
  Object.assign(s.surface.tiles[t3], { type: 'nest', deposit: null });
  s.door.hp = 3; // 거의 부서진 문
  s.time.tick = DAYLIGHT_TICKS - 1;
  tick(s);
  assert.equal(s.raid.zombies.length, TU.PRACTICE_RAID);
  ticks(s, DAY_TICKS - DAYLIGHT_TICKS - 2);
  assert.equal(s.raid.breached, false, '문이 안 부서짐');
  assert.ok(s.door.hp >= TU.PRACTICE_DOOR_MIN_HP);
  assert.ok(s.bunker.rooms.every((r) => !r.broken));
  // 2일차 밤은 평소대로 (문이 약하면 부서진다)
  ticks(s, 2);
  s.door.hp = 3;
  s.time.tick = DAY_TICKS + DAYLIGHT_TICKS - 1;
  tick(s);
  assert.ok(s.raid.zombies.length > TU.PRACTICE_RAID);
  ticks(s, 200);
  assert.equal(s.raid.breached, true, '2일차부터는 진짜 습격');
});
