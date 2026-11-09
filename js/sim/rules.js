// 1틱(0.05초) 진행. 화면·입력과 무관한 순수 규칙.
// state.events = 이번 틱에 일어난 일(줍기·납부·해금·공격·죽음…). 화면·소리 연출이 읽는다.
import { moveCommander } from './commander.js';
import { updateCoins } from './coins.js';
import { updatePads, refreshPads } from './pads.js';
import { updateBuildings } from './buildings.js';
import { updateWaves } from './waves.js';
import { updateArchers, updateEnemies, spawnEnemy } from './units.js';
import { updateCombat } from './combat.js';

export function step(state, input, balance) {
  state.events = [];
  if (state.result) return; // 끝난 판은 멈춤
  moveCommander(state, input, balance);
  updateWaves(state, balance, spawnEnemy);
  updateArchers(state, balance);
  updateEnemies(state, balance);
  updateCombat(state, balance);
  updateCoins(state, balance);
  updateBuildings(state, balance);
  refreshPads(state, balance);
  updatePads(state, balance);
  checkResult(state, balance);
  state.tick += 1;
  state.time = state.tick * balance.sim.tickSeconds;
}

/** 승리: 마지막 웨이브까지 다 나오고 적이 모두 처치됨. 패배: 성채 체력 0 */
export function checkResult(state, balance) {
  if (state.result) return;
  if (state.castle.hp <= 0) state.result = 'lose';
  else if (state.waves.current >= balance.waves.total && state.waves.queue.length === 0 && state.enemies.length === 0) state.result = 'win';
  if (state.result) state.events.push({ type: 'gameOver', result: state.result, wave: state.waves.current });
}
