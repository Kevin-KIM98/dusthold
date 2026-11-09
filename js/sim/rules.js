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
  moveCommander(state, input, balance);
  updateWaves(state, balance, spawnEnemy);
  updateArchers(state, balance);
  updateEnemies(state, balance);
  updateCombat(state, balance);
  updateCoins(state, balance);
  updateBuildings(state, balance);
  refreshPads(state, balance);
  updatePads(state, balance);
  state.tick += 1;
  state.time = state.tick * balance.sim.tickSeconds;
}
