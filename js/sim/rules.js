// 1틱(0.05초) 진행. 화면·입력과 무관한 순수 규칙.
// state.events = 이번 틱에 일어난 일(줍기·납부·해금·공격·죽음…). 화면·소리 연출이 읽는다.
import { moveCommander } from './commander.js';
import { updateCoins } from './coins.js';
import { updatePads, refreshPads } from './pads.js';
import { updateBuildings } from './buildings.js';
import { updateCamps } from './camps.js';
import { updateSoldiers } from './soldiers.js';
import { updateArchers, updateEnemies } from './units.js';
import { updateCombat, dropEnemyCoins } from './combat.js';

export function step(state, input, balance) {
  state.events = [];
  if (state.result) return; // 끝난 판은 멈춤
  moveCommander(state, input, balance);
  updateCamps(state, balance);
  updateArchers(state, balance);
  updateSoldiers(state, balance);
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

/** 승리: 적 기지를 모두 점령 (남은 적은 은화로). 패배: 성채 체력 0 */
export function checkResult(state, balance) {
  if (state.result) return;
  if (state.castle.hp <= 0) state.result = 'lose';
  else if (state.camps.length && state.camps.every(c => c.captured)) {
    state.result = 'win';
    for (const e of state.enemies) dropEnemyCoins(state, e, balance); // 은화 폭발
    state.enemies = [];
  }
  if (state.result) state.events.push({ type: 'gameOver', result: state.result, stage: state.stage });
}
