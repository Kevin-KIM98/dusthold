// 생존자 만들기·상태 판정. DOM 금지.
import { CONFIG } from '../config.js';

const SV = CONFIG.SURVIVOR;
const CB = CONFIG.COMBAT;

/** 새 생존자. specialty를 안 주면 랜덤. 이름은 아직 안 쓴 이름 중에서. */
export function makeSurvivor(state, rng, specialty) {
  const used = new Set([...state.survivors, ...state.waiting].map((s) => s.name));
  const pool = SV.NAMES.filter((n) => !used.has(n));
  const id = state.nextSurvivorId++;
  const name = pool.length > 0 ? rng.pick(pool) : rng.pick(SV.NAMES) + ' ' + id;
  return {
    id,
    name,
    specialty: specialty || rng.pick(SV.SPECIALTIES),
    hp: SV.HP,
    job: 'rest',
    jobTile: null,
    weapon: false,
  };
}

export function isInjured(s) {
  return s.hp <= SV.INJURED_HP;
}

/** 쉬는 중이고 부상 아님 = 일을 맡길 수 있음 */
export function isAvailable(s) {
  return s.job === 'rest' && !isInjured(s);
}

export function combatPower(s) {
  return (s.specialty === 'combat' ? CB.SPECIALTY_POWER : CB.BASE_POWER) + (s.weapon ? CB.WEAPON_POWER : 0);
}

export function findSurvivor(state, id) {
  return state.survivors.find((s) => s.id === id) || null;
}

export function setRest(s) {
  s.job = 'rest';
  s.jobTile = null;
}
