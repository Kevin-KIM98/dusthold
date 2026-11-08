// 게임 상태 생성·직렬화·복원. DOM 금지 (Node에서 테스트됨).
// 저장소(localStorage) 접근은 main.js가 한다. 여기서는 문자열만 다룬다.

import { CONFIG } from '../config.js';
import { createRng } from './rng.js';
import { pushLog, pushEvent } from './log.js';
import { makeSurvivor } from './survivors.js';
import { generateMap } from './surface.js';

export { pushLog, pushEvent };

const T = CONFIG.TIME;

/** 새 게임 상태를 만든다. seed는 정수. */
export function createState(seed) {
  const rng = createRng(seed);
  const state = {
    version: CONFIG.SAVE.VERSION,
    seed: Number(seed) >>> 0,
    rng: 0,
    time: { tick: 0, acc: 0 },
    speed: T.DEFAULT_SPEED,
    paused: false,
    resources: { ...CONFIG.START.RESOURCES },
    storageCap: CONFIG.START.STORAGE_CAP,
    power: { produced: 0, consumed: 0 },
    popCap: CONFIG.START.POP_CAP,
    survivors: [],
    waiting: [],     // 인구 상한 초과로 입구에서 대기 중인 생존자
    nextSurvivorId: 1,
    surface: generateMap(seed),
    log: [],         // { tick, key, params } — 문자열은 strings.js로 바꿔 보여준다
    events: [],      // 한 프레임 안에서 UI(토스트)가 소비하는 임시 이벤트. 저장 안 함.
  };
  const specs = CONFIG.SURVIVOR.SPECIALTIES;
  for (let i = 0; i < CONFIG.START.SURVIVORS; i++) {
    state.survivors.push(makeSurvivor(state, rng, specs[i % specs.length]));
  }
  state.rng = rng.getState();
  pushLog(state, 'log.start', { n: state.survivors.length });
  return state;
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

/** 옛 버전 저장을 현재 버전으로 한 단계씩 올린다. 올릴 수 없으면 null. */
export function migrate(raw) {
  let s = raw;
  if (s.version === 1) {
    // v1(M1) → v2(M2): 지상 맵·대기열·생존자 필드 추가. 맵은 시드로 다시 만든다.
    const survivors = Array.isArray(s.survivors) ? s.survivors : [];
    s = {
      ...s,
      version: 2,
      survivors: survivors.map((v) => ({ jobTile: null, weapon: false, ...v, job: 'rest' })),
      waiting: [],
      nextSurvivorId: survivors.reduce((m, v) => Math.max(m, v.id || 0), 0) + 1,
      surface: generateMap(s.seed),
    };
  }
  if (s.version !== CONFIG.SAVE.VERSION) return null;
  return s;
}

function isValidState(s) {
  return (
    s.time && Number.isFinite(s.time.tick) &&
    s.resources && typeof s.resources === 'object' &&
    Array.isArray(s.survivors) &&
    Array.isArray(s.waiting) &&
    Array.isArray(s.log) &&
    s.surface && Array.isArray(s.surface.tiles) &&
    s.surface.tiles.length === s.surface.size * s.surface.size &&
    Array.isArray(s.surface.expeditions) &&
    T.SPEEDS.includes(s.speed) &&
    typeof s.paused === 'boolean'
  );
}
