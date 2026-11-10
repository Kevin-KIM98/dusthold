// 저장·불러오기용 변환 (순수 함수). 상태는 평범한 객체라 JSON으로 그대로 옮길 수 있다.
// 실제로 어디에 저장할지(브라우저 저장소)는 js/storage.js가 맡는다.
import { nextStage } from './stages.js';
import { createState } from './state.js';
import { createCamps } from './camps.js';

/** 상태 → 저장 문자열 */
export function serialize(state, balance) {
  const { events, ...rest } = state; // 이벤트는 한 틱짜리라 저장하지 않음
  return JSON.stringify({ v: balance.save.version, pads: balance.pads.list.map(p => p.id), state: rest });
}

/**
 * 저장 문자열 → 상태. 쓸 수 없으면 null
 * - 저장 형식 버전이 다르거나, 패드 구성이 바뀌었거나, 이미 끝난 판이거나, 망가진 데이터면 버린다
 */
export function deserialize(text, balance) {
  if (!text) return null;
  let data;
  try { data = JSON.parse(text); } catch { return null; }
  if (!data || !data.state) return null;
  // 이전 형식(1·2: 웨이브 방식) → 지금 형식(3: 적 기지 방식)으로 옮겨 담기. 기지·은화·건물은 그대로
  if ((data.v === 1 || data.v === 2) && balance.save.version === 3) {
    const st = data.state;
    st.stage = st.stage || 1;
    delete st.waves;
    st.enemies = [];
    st.spawn = { startTick: st.tick, paused: false };
    st.obstacles = createState(balance, st.seed).obstacles; // 절벽 포함한 새 지형
    st.camps = createCamps(st, balance);
    if (st.result === 'win') st.result = null;
    data.v = 3;
  }
  if (data.v !== balance.save.version) return null;
  const ids = balance.pads.list.map(p => p.id);
  if (!Array.isArray(data.pads) || data.pads.join(',') !== ids.join(',')) return null;
  const s = data.state;
  const need = ['tick', 'rng', 'commander', 'castle', 'pads', 'coins', 'buildings', 'walls', 'archers', 'enemies', 'spawn', 'camps', 'obstacles', 'paths'];
  if (need.some(k => s[k] === undefined)) return null;
  s.events = [];
  if (s.result === 'win') nextStage(s, balance); // 클리어 화면에서 나갔으면 다음 스테이지부터
  else if (s.result) return null;               // 진 판은 이어하지 않음
  s.events = [];
  return s;
}

/** 이어하기 창에 보여 줄 요약 */
export function summary(state) {
  return { stage: state.stage || 1, captured: state.camps.filter(c => c.captured).length, camps: state.camps.length, coins: state.commander.coins, time: state.time, built: state.buildings.length };
}
