// 완료 기준: 상단 바에 자원 6종과 인구가 표시되고 값이 바뀌면 갱신된다 (뷰모델 단계)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../js/sim/state.js';
import { tick } from '../js/sim/time.js';
import { topBarModel, clockModel, logModel, formatMMSS } from '../js/render/viewModel.js';
import { t } from '../js/strings.js';

test('상단 바는 자원 6종 + 인구 = 7칸, 순서 고정', () => {
  const s = createState(1);
  const bar = topBarModel(s);
  assert.deepEqual(bar.map((i) => i.id), ['food', 'water', 'wood', 'scrap', 'power', 'parts', 'pop']);
  assert.deepEqual(bar.map((i) => i.text), ['20', '20', '40', '25', '0/3', '0', '4/6'], '전력: 생산 0 / 수요 3 (시작 정수실)');
  assert.deepEqual(bar.map((i) => i.label), ['식량', '물', '목재', '고철', '전력', '통신부품', '인구']);
});

test('값이 바뀌면 뷰모델도 바뀌고, 부족하면 low 표시', () => {
  const s = createState(1);
  s.resources.wood = 7;
  s.resources.food = 3; // 4명 하루 8 미만 → 부족
  s.power = { produced: 0, consumed: 5, used: 0 };
  const bar = topBarModel(s);
  const by = Object.fromEntries(bar.map((i) => [i.id, i]));
  assert.equal(by.wood.text, '7');
  assert.equal(by.food.low, true);
  assert.equal(by.water.low, false);
  assert.equal(by.power.text, '0/5');
  assert.equal(by.power.low, true);
});

test('시계 줄: 1일차 06:00 낮, 습격까지 3:00, ×1', () => {
  const s = createState(1);
  const c = clockModel(s);
  assert.equal(c.dayText, '1일차');
  assert.equal(c.timeText, '06:00');
  assert.equal(c.phase, 'day');
  assert.equal(c.countdownText, '습격까지 3:00');
  assert.equal(c.speedText, '×1');
  for (let i = 0; i < 1800; i++) tick(s);
  const n = clockModel(s);
  assert.equal(n.phase, 'night');
  assert.equal(n.timeText, '00:00');
  assert.equal(n.countdownText, '새벽까지 1:00');
  s.paused = true;
  assert.equal(clockModel(s).speedText, '멈춤');
});

test('기록은 최신이 먼저, 한국어 문자열로 바뀐다', () => {
  const s = createState(1);
  for (let i = 0; i < 1800; i++) tick(s);
  const rows = logModel(s);
  assert.equal(rows[0].text, t('log.nightFalls'));
  assert.equal(rows[rows.length - 1].text, '벙커에 도착했다. 생존자 4명.');
  assert.equal(rows[0].dayText, '1일차');
});

test('mm:ss 포맷', () => {
  assert.equal(formatMMSS(180), '3:00');
  assert.equal(formatMMSS(59.2), '1:00');
  assert.equal(formatMMSS(5), '0:05');
});
