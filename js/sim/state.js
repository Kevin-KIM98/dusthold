// 게임 상태 생성·직렬화·복원. DOM 금지 (Node에서 테스트됨).
// 저장소(localStorage) 접근은 main.js가 한다. 여기서는 문자열만 다룬다.

import { CONFIG } from '../config.js';
import { createRng } from './rng.js';

const T = CONFIG.TIME;

/** 새 게임 상태를 만든다. seed는 정수. */
export function createState(seed) {
  const rng = createRng(seed);
  const names = rng.shuffle(CONFIG.SURVIVOR.NAMES);
  const survivors = [];
  for (let i = 0; i < CONFIG.START.SURVIVORS; i++) {
    survivors.push({
      id: i + 1,
      name: names[i % names.length],
      specialty: CONFIG.SURVIVOR.SPECIALTIES[i % CONFIG.SURVIVOR.SPECIALTIES.length],
      hp: CONFIG.SURVIVOR.HP,
      job: 'rest',
    });
  }

  const state = {
    version: CONFIG.SAVE.VERSION,
    seed: Number(seed) >>> 0,
    rng: rng.getState(),
    time: { tick: 0, acc: 0 },
    speed: T.DEFAULT_SPEED,
    paused: false,
    resources: { ...CONFIG.START.RESOURCES },
    storageCap: CONFIG.START.STORAGE_CAP,
    power: { produced: 0, consumed: 0 },
    popCap: CONFIG.START.POP_CAP,
    survivors,
    log: [],       // { tick, key, params } — 문자열은 strings.js로 바꿔 보여준다
    events: [],    // 한 프레임 안에서 UI(토스트)가 소비하는 임시 이벤트. 저장 안 함.
  };
  pushLog(state, 'log.start', { n: survivors.length });
  return state;
}

export function pushLog(state, key, params) {
  state.log.push({ tick: state.time.tick, key, params: params || null });
  if (state.log.length > CONFIG.UI.LOG_MAX) {
    state.log.splice(0, state.log.length - CONFIG.UI.LOG_MAX);
  }
}

export function pushEvent(state, key, params) {
  state.events.push({ key, params: params || null });
}

/** 저장용 JSON 문자열 */
export function serialize(state) {
  const { events, ...rest } = state;
  const copy = { ...rest, time: { tick: state.time.tick, acc: 0 } };
  return JSON.stringify(copy);
}

/**
 * 저장 문자열 → 상태. 버전이 다르면 migrate()로 올려보고, 못 올리면 null.
 * 깨진 JSON도 null.
 */
export function deserialize(json) {
  let raw;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const migrated = migrate(raw);
  if (!migrated) return null;
  if (!isValidState(migrated)) return null;
  migrated.events = [];
  migrated.time.acc = 0;
  return migrated;
}

/** 옛 버전 저장을 현재 버전으로 올린다. 올릴 수 없으면 null. */
export function migrate(raw) {
  if (raw.version === CONFIG.SAVE.VERSION) return raw;
  // 아직 이전 버전이 없다. 버전이 바뀌면 여기에 단계별 변환을 추가한다.
  return null;
}

function isValidState(s) {
  return (
    s.time && Number.isFinite(s.time.tick) &&
    s.resources && typeof s.resources === 'object' &&
    Array.isArray(s.survivors) &&
    Array.isArray(s.log) &&
    T.SPEEDS.includes(s.speed) &&
    typeof s.paused === 'boolean'
  );
}
