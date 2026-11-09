// 적 웨이브 일정·구성 (기획서 ③). 공식은 전부 balance.waves 값으로 계산.
import { stageScale } from './stages.js';

/** 웨이브 n(1부터)의 일반 병력 수: floor(base + n × perWave), 상한 cap */
export function waveSize(n, balance, stage = 1) {
  const w = balance.waves;
  return Math.min(w.cap, Math.floor((w.base + n * w.perWave) * stageScale(stage, balance).size));
}

export function shieldRatio(n, balance) {
  let r = 0;
  for (const s of balance.waves.shield) if (n >= s.from) r = s.ratio;
  return r;
}

export function bossCount(n, balance) {
  const b = balance.waves.bosses.find(x => x.wave === n);
  return b ? b.count : 0;
}

/** 웨이브 n이 시작하는 시각(초) */
export function waveStartSeconds(n, balance) {
  const w = balance.waves;
  let t = w.firstAt;
  for (let k = 2; k <= n; k++) t += k >= w.lateFrom ? w.lateInterval : w.interval;
  return t;
}

/** 웨이브 n의 길: 번갈아(홀수 = 첫 길), lateFrom 이후 두 길 동시 */
export function wavePathIds(n, balance) {
  const ids = balance.map.paths.map(p => p.id);
  if (n >= balance.waves.bothPathsFrom) return ids;
  return [ids[(n - 1) % ids.length]];
}

/** 웨이브 n의 등장 순서: [{ type, pathId }] — 방패병은 고르게 섞고, 거인은 맨 뒤 */
export function waveComposition(n, balance, stage = 1) {
  const size = waveSize(n, balance, stage);
  const shields = Math.floor(size * shieldRatio(n, balance));
  const paths = wavePathIds(n, balance);
  const list = [];
  for (let i = 0; i < size; i++) {
    const isShield = Math.floor((i + 1) * shields / size) > Math.floor(i * shields / size);
    list.push(isShield ? 'shield' : 'raider');
  }
  for (let i = 0; i < bossCount(n, balance); i++) list.push('giant');
  return list.map((type, i) => ({ type, pathId: paths[i % paths.length] }));
}

export function createWaves() {
  // paused: 테스트·디버그 장면용 (웨이브를 멈춤)
  return { current: 0, queue: [], paused: false, startTick: 0 };
}

function secondsToTicks(s, balance) { return Math.round(s / balance.sim.tickSeconds); }

/** 웨이브 시작 시각이 되면 등장 대기열을 채우고, 대기열에서 시간 맞춰 적을 내보낸다 */
export function updateWaves(state, balance, spawnEnemy) {
  const w = state.waves;
  if (w.paused) return;
  const total = balance.waves.total;
  // 이번 틱이 끝나는 시각(tick+1)이 시작 시각에 닿으면 시작
  // 스테이지가 시작된 틱(startTick)부터 잰다
  if (w.current < total && state.tick + 1 - (w.startTick || 0) >= secondsToTicks(waveStartSeconds(w.current + 1, balance), balance)) {
    w.current += 1;
    const gap = secondsToTicks(balance.waves.spawnGap, balance);
    // 길마다 따로 줄을 세운다 (두 길 동시면 양쪽에서 같이 나옴)
    const perPath = {};
    for (const e of waveComposition(w.current, balance, state.stage)) {
      const k = perPath[e.pathId] = (perPath[e.pathId] ?? -1) + 1;
      w.queue.push({ type: e.type, pathId: e.pathId, at: state.tick + k * gap, wave: w.current });
    }
    state.events.push({ type: 'waveStart', wave: w.current });
  }
  if (w.queue.length) {
    const rest = [];
    for (const q of w.queue) {
      if (q.at <= state.tick) spawnEnemy(state, q.type, q.pathId, balance, q.wave);
      else rest.push(q);
    }
    w.queue = rest;
  }
}

/** 다음 웨이브까지 남은 초 (없으면 -1) */
export function secondsToNextWave(state, balance) {
  const n = state.waves.current + 1;
  if (n > balance.waves.total) return -1;
  return Math.max(0, waveStartSeconds(n, balance) - (state.time - (state.waves.startTick || 0) * balance.sim.tickSeconds));
}
