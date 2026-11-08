// 밤 분위기 연출 (화면만): 서서히 어두워지기·밝아지기, 화면 흔들림
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../js/config.js';
import { createState } from '../js/sim/state.js';
import { nightLevel, createShake, doorStep, veilOpacity } from '../js/render/ambience.js';

const T = CONFIG.TIME, A = CONFIG.AMBIENCE;
const at = (s, day, sec) => { s.time.tick = Math.round(((day - 1) * T.DAY_SEC + sec) / T.TICK_SEC); return nightLevel(s); };

test('밤 정도: 1일차 아침은 밝게 시작, 해 질 녘 서서히 어두워지고, 밤엔 1, 새벽에 서서히 밝아진다', () => {
  const s = createState(1);
  assert.equal(at(s, 1, 0), 0, '새 게임은 밝게');
  assert.equal(at(s, 1, 60), 0);
  assert.equal(at(s, 1, T.DAYLIGHT_SEC - A.DUSK_SEC), 0);
  const mid = at(s, 1, T.DAYLIGHT_SEC - A.DUSK_SEC / 2);
  assert.ok(mid > 0.4 && mid < 0.6, `해 질 녘 중간 ${mid}`);
  assert.equal(at(s, 1, T.DAYLIGHT_SEC), 1);
  assert.equal(at(s, 1, T.DAY_SEC - 1), 1);
  assert.equal(at(s, 2, 0), 1, '2일차 새벽은 어둠에서');
  assert.ok(Math.abs(at(s, 2, A.DAWN_SEC / 2) - 0.5) < 1e-9);
  assert.equal(at(s, 2, A.DAWN_SEC), 0);
  assert.equal(veilOpacity(0.5, 'surface'), 0.5);
  assert.equal(veilOpacity(1, 'bunker'), 0, '가장자리 어둠은 지상에서만');
});

test('화면 흔들림: 세게·약하게, 시간이 지나면 잦아들고 끝난다, 정수 픽셀, 움직임 줄이기면 없음', () => {
  const sh = createShake();
  assert.equal(sh.offset(0), null);
  sh.kick('big', 1000);
  let maxA = 0;
  for (let t = 1000; t < 1000 + A.SHAKE_BIG.ms; t += 7) {
    const o = sh.offset(t);
    if (o) { assert.ok(Number.isInteger(o.x) && Number.isInteger(o.y)); maxA = Math.max(maxA, Math.abs(o.x)); }
  }
  assert.ok(maxA >= A.SHAKE_SMALL.amp && maxA <= A.SHAKE_BIG.amp, `최대 ${maxA}`);
  assert.equal(sh.offset(1000 + A.SHAKE_BIG.ms), null, '끝');
  sh.kick('big', 5000);
  sh.kick('small', 5010); // 센 흔들림 중엔 약한 것이 덮어쓰지 않는다
  let still = false;
  for (let t = 5000 + A.SHAKE_SMALL.ms + 10; t < 5000 + A.SHAKE_SMALL.ms + 80; t += 5) still ||= !!sh.offset(t);
  assert.ok(still, '약한 흔들림 시간이 지나도 센 흔들림은 계속');
  const calm = createShake();
  calm.setReduced(true);
  calm.kick('big', 0);
  assert.equal(calm.offset(10), null);
});

test('방폭문 체력 칸: 체력이 줄면 칸 수가 준다', () => {
  const s = createState(2);
  const full = doorStep(s);
  assert.equal(full, A.SHAKE_DOOR_STEPS);
  s.door.hp *= 0.85;
  assert.equal(doorStep(s), A.SHAKE_DOOR_STEPS - 1);
  s.door.hp = 0;
  assert.equal(doorStep(s), 0);
});
