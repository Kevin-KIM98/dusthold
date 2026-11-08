// 상태 → 화면에 쓸 글자/플래그. DOM 없음 (Node에서 테스트). ui.js가 이걸 DOM에 붙인다.

import { CONFIG } from '../config.js';
import { t } from '../strings.js';
import { summarize } from '../sim/economy.js';
import { getDay, getPhase, getClock, getSecondsToPhaseChange, isNight, DAY_TICKS } from '../sim/clock.js';
import {
  getTile, canExplore, canAttack, canGather, validateMembers, partyPower, requiredPower, isCombatTile,
  isGatherable, isDepleted, expeditionAt, gatherersAt, expeditionSec, gatherPerDay,
} from '../sim/surface.js';
import { isAvailable, isInjured, combatPower } from '../sim/survivors.js';

const S = CONFIG.SURFACE;

function pad2(n) {
  return n < 10 ? '0' + n : String(n);
}

export function formatMMSS(sec) {
  const s = Math.max(0, Math.ceil(sec));
  return Math.floor(s / 60) + ':' + pad2(s % 60);
}

/** {wood: 15, scrap: 3} → "목재 +15, 고철 +3" */
export function formatReward(reward) {
  return Object.keys(reward).map((k) => t('reward.' + k, { n: reward[k] })).join(', ');
}

/** 기록·토스트의 params를 사람이 읽는 글로 바꿔서 문자열을 만든다 */
export function formatMessage(key, params) {
  if (!params) return t(key);
  const p = {};
  for (const k of Object.keys(params)) {
    const v = params[k];
    if (k === 'tile') p[k] = t('tile.' + v);
    else if (k === 'reward' && v && typeof v === 'object') p[k] = formatReward(v);
    else if (Array.isArray(v)) p[k] = v.join(', ');
    else p[k] = v;
  }
  return t(key, p);
}

/** 상단 자원 바 7칸: 식량·물·목재·고철·전력·통신부품·인구 */
export function topBarModel(state) {
  const s = summarize(state);
  const items = [];
  for (const id of CONFIG.RESOURCE_ORDER) {
    if (id === 'power') {
      items.push({ id, label: t('res.power'), text: s.power.produced + '/' + s.power.consumed, low: s.power.low });
    } else {
      items.push({ id, label: t('res.' + id), text: String(Math.floor(s[id].value)), low: s[id].low });
    }
  }
  items.push({ id: 'pop', label: t('res.pop'), text: s.pop.count + '/' + s.pop.cap, low: s.pop.low });
  return items;
}

/** 시계 줄 */
export function clockModel(state) {
  const phase = getPhase(state);
  const c = getClock(state);
  const remain = formatMMSS(getSecondsToPhaseChange(state));
  return {
    phase,
    dayText: t('clock.day', { day: getDay(state) }),
    timeText: pad2(c.hour) + ':' + pad2(c.minute),
    phaseText: t('clock.phase.' + phase),
    countdownText: phase === 'day' ? t('clock.toNight', { time: remain }) : t('clock.toDawn', { time: remain }),
    paused: state.paused,
    speed: state.speed,
    speedText: state.paused ? t('speed.paused') : t('speed.x', { n: state.speed }),
  };
}

/** 기록 탭: 최신이 위 */
export function logModel(state) {
  const out = [];
  for (let i = state.log.length - 1; i >= 0; i--) {
    const e = state.log[i];
    const day = Math.floor(e.tick / DAY_TICKS) + 1;
    out.push({ dayText: t('clock.day', { day }), text: formatMessage(e.key, e.params) });
  }
  return out;
}

// ---------- 지상 선택 패널 ----------
function survivorLine(s, withPower) {
  let txt = t('survivor.line', { name: s.name, spec: t('spec.' + s.specialty), hp: s.hp });
  if (withPower) txt += ' · ' + t('survivor.power', { n: combatPower(s) });
  if (isInjured(s)) txt += ' · ' + t('survivor.injured');
  return txt;
}

function reasonText(check) {
  return check.ok ? '' : t(check.reason, check.params || undefined);
}

export function tileTitle(tile) {
  if (!tile.revealed) return t('tile.fog');
  return t('tile.' + tile.type);
}

/**
 * 탭한 지상 타일의 패널 내용.
 * picker: { mode: 'explore'|'attack'|'gather', tile, chosen: [id] } 또는 null
 * 버튼은 { action, arg?, label, enabled, reason, primary? }
 */
export function surfacePanelModel(state, i, picker) {
  const tile = getTile(state, i);
  if (!tile) return null;
  const m = { title: tileTitle(tile), sub: tile.ring > 0 ? t('panel.ring', { ring: tile.ring }) : '', lines: [], actions: [], list: [], picker: null };
  const exp = expeditionAt(state, i);

  if (tile.type === 'entrance') {
    m.lines.push(t('panel.entrance'));
    if (state.waiting.length > 0) m.lines.push(t('panel.waiting', { n: state.waiting.length }));
  } else if (!tile.revealed) {
    m.lines.push(t('panel.fog'));
    const c = canExplore(state, i);
    if (c.ok) m.lines.push(t('panel.explorable', { sec: expeditionSec(tile) }));
    if (!exp) m.actions.push({ action: 'explore', label: t('action.explore'), enabled: c.ok, reason: reasonText(c), primary: true });
  } else if (isGatherable(tile)) {
    const g = S.TILES[tile.type].gather;
    m.lines.push(t('panel.yield', { res: t('res.' + g.res), n: gatherPerDay(tile) }));
    m.lines.push(tile.deposit === null ? t('panel.depositInf') : t('panel.deposit', { n: tile.deposit }));
    if (isDepleted(tile)) m.lines.push(t('panel.exhausted'));
    const workers = gatherersAt(state, i);
    m.lines.push(t('panel.workers', { n: workers.length }));
    const c = canGather(state, i);
    const anyone = state.survivors.some(isAvailable);
    const enabled = c.ok && anyone;
    m.actions.push({ action: 'gather', label: t('action.gather'), enabled, reason: c.ok ? (anyone ? '' : t('picker.none')) : reasonText(c), primary: true });
    for (const s of workers) m.list.push({ text: survivorLine(s, false), action: 'unassign', arg: s.id, label: t('action.unassign') });
  } else if (isCombatTile(tile)) {
    const need = requiredPower(tile);
    if (tile.cleared) {
      m.lines.push(t('panel.cleared'));
    } else {
      m.lines.push(t('panel.required', { n: need }));
      if (tile.type === 'nest' && tile.ring <= S.TILES.nest.raidBonusMaxRing) m.lines.push(t('panel.nestWarn', { n: S.TILES.nest.raidBonus }));
      if (tile.type === 'base') m.lines.push(t('panel.baseInfo'));
      const c = canAttack(state, i);
      if (!exp) m.actions.push({ action: 'attack', label: t('action.attack'), enabled: c.ok, reason: reasonText(c), primary: true });
    }
  } else if (tile.cleared) {
    m.lines.push(t('panel.barren'));
  }

  if (exp) {
    const remain = formatMMSS(exp.ticksLeft * CONFIG.TIME.TICK_SEC);
    m.lines.push(t('panel.expedition', { n: exp.members.length, time: remain }));
  }

  if (picker && picker.tile === i) m.picker = pickerModel(state, tile, picker);
  return m;
}

function pickerModel(state, tile, picker) {
  const avail = state.survivors.filter(isAvailable);
  const chosen = picker.chosen.filter((id) => avail.some((s) => s.id === id));
  const combat = picker.mode === 'attack';
  const pm = { mode: picker.mode, title: '', rows: [], summary: '', warn: '', depart: null, empty: avail.length === 0 ? t('picker.none') : '' };
  if (picker.mode === 'gather') {
    pm.title = t('picker.gather');
    for (const s of avail) pm.rows.push({ action: 'assign', arg: s.id, text: survivorLine(s, false), selected: false });
    return pm;
  }
  pm.title = t(combat ? 'picker.attack' : 'picker.explore', { max: S.EXPEDITION_MAX });
  for (const s of avail) pm.rows.push({ action: 'pick', arg: s.id, text: survivorLine(s, true), selected: chosen.includes(s.id) });
  const v = validateMembers(state, chosen);
  if (combat) {
    const power = partyPower(state, chosen);
    const need = requiredPower(tile);
    pm.summary = t('picker.power', { power, need });
    if (chosen.length > 0 && power < need) pm.warn = t('picker.warnWeak');
  } else {
    pm.summary = t('picker.chosen', { n: chosen.length });
  }
  pm.depart = { action: 'depart', label: t('action.depart', { n: chosen.length }), enabled: v.ok, reason: chosen.length === 0 ? '' : reasonText(v) };
  return pm;
}

/** 패널을 다시 그릴지 판단하는 키 */
export function panelKey(m) {
  return m ? JSON.stringify(m) : '';
}

export { isNight };
