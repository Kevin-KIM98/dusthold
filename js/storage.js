// 이 브라우저(=접속한 사람)에만 저장. 저장소를 못 쓰는 환경(사생활 보호 모드 등)이면 조용히 건너뛴다.
import { serialize, deserialize } from './sim/save.js';

const KEY = 'lastgate.save';

export function loadSave(balance) {
  try { return deserialize(localStorage.getItem(KEY), balance); } catch { return null; }
}
export function writeSave(state, balance) {
  try { localStorage.setItem(KEY, serialize(state, balance)); return true; } catch { return false; }
}
export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* 저장소 없음 */ }
}
