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
import {
  roomAt, digAt, isDug, canDig, canBuild, canCraft, buildersOf, workersOf, getBuildStage,
  projectRemainingSec, roomDef, inBounds, turrets, canBuildTurret, canRepair, repairCost,
} from '../sim/bunker.js';
import { doorMax, canUpgradeDoor, defenseDps, bigRaidMult } from '../sim/raid.js';
import { currentStep, TUTORIAL_STEPS, guardCellFree, isTutorialActive } from '../sim/tutorial.js';
import { dayMissions } from '../sim/missions.js';
import { tileIndex } from '../sim/surface.js';
import { workerMap } from '../sim/economy.js';

const S = CONFIG.SURFACE;

function pad2(n) {
  return n < 10 ? '0' + n : String(n);
}

export function formatMMSS(sec) {
  const s = Math.max(0, Math.ceil(sec));
  return Math.floor(s / 60) + ':' + pad2(s % 60);
}

/** {wood: 10, scrap: 25} → "목재 10, 고철 25" */
export function formatCost(cost) {
  return Object.keys(cost).map((k) => t('cost.' + k, { n: cost[k] })).join(', ');
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
    else if (k === 'room') p[k] = t('room.' + v);
    else if (k === 'res') p[k] = t('res.' + v);
    else if (k === 'item') p[k] = t('item.' + v);
    else if (k === 'reward' && v && typeof v === 'object') p[k] = formatReward(v);
    else if (v && typeof v === 'object' && !Array.isArray(v)) p[k] = formatCost(v);
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
  let txt = t('survivor.line', { name: s.name, spec: t('spec.' + s.specialty), hp: Math.floor(s.hp) });
  if (withPower) txt += ' · ' + t('survivor.power', { n: combatPower(s) });
  if (s.weapon) txt += ' · ' + t('survivor.weapon');
  if (s.tool) txt += ' · ' + t('survivor.tool');
  if (s.gear) txt += ' · ' + t('survivor.gear');
  if (isInjured(s)) txt += ' · ' + t('survivor.injured');
  return txt;
}

export function reasonText(check) {
  return check.ok ? '' : formatMessage(check.reason, check.params);
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
    if (state.raid && state.raid.active) {
      const near = state.raid.zombies.filter((z) => z.phase === 'approach').length;
      if (near > 0) m.lines.push(t('panel.raidNear', { n: near }));
    }
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

// ---------- 벙커 선택 패널 ----------
function pct(p) {
  return Math.floor(Math.max(0, Math.min(1, p)) * 100);
}

function simplePicker(state, mode) {
  const avail = state.survivors.filter(isAvailable);
  return {
    mode,
    title: t(mode === 'builder' ? 'picker.builder' : 'picker.worker'),
    rows: avail.map((s) => ({ action: 'assign', arg: s.id, text: survivorLine(s, false), selected: false })),
    summary: '', warn: '', depart: null,
    empty: avail.length === 0 ? t('picker.none') : '',
  };
}

function projectLines(state, m, id, progress) {
  const remain = projectRemainingSec(state, id);
  m.lines.push(Number.isFinite(remain)
    ? t('bpanel.progress', { pct: pct(progress), time: formatMMSS(remain) })
    : t('bpanel.progressStopped', { pct: pct(progress) }));
  const builders = buildersOf(state, id);
  m.lines.push(t('bpanel.builders', { n: builders.length, max: CONFIG.BUNKER.MAX_BUILDERS }));
  for (const s of builders) m.list.push({ text: survivorLine(s, false), action: 'unassign', arg: s.id, label: t('action.unassign') });
  const anyone = state.survivors.some(isAvailable);
  const full = builders.length >= CONFIG.BUNKER.MAX_BUILDERS;
  m.actions.push({ action: 'addBuilder', arg: id, label: t('action.addBuilder'), enabled: !full && anyone, reason: full ? t('reason.full') : anyone ? '' : t('picker.none'), primary: true });
}

function roomEffect(def, type) {
  const n = def.perWorker || (def.produce && def.produce.perDay) || def.popCap || def.storageCap || def.healPerDay || def.dpsPerGuard || def.dps
    || (type === 'workshop' ? CONFIG.COMBAT.WEAPON_POWER : 0);
  return t('room.desc.' + type, { n });
}

/**
 * 탭한 벙커 칸(또는 문)의 패널. sel = { kind: 'cell', floor, col } | { kind: 'door' }
 * picker = { mode: 'builder'|'worker', target: id } | null
 */
export function bunkerPanelModel(state, sel, picker) {
  if (!sel) return null;
  const m = { title: '', sub: '', lines: [], actions: [], list: [], picker: null, menu: null };
  if (sel.kind === 'door') {
    m.title = t('room.door');
    m.lines.push(t('bpanel.door', { hp: Math.ceil(state.door.hp), max: doorMax(state), level: state.door.level }));
    m.lines.push(state.door.hp <= 0 ? t('bpanel.doorDamaged') : t('bpanel.doorInfo'));
    const raid = state.raid;
    if (raid && raid.active) {
      const inside = raid.zombies.filter((z) => z.phase === 'inside').length;
      if (inside > 0) m.lines.push(t('bpanel.raidInside', { n: inside }));
      else m.lines.push(t('bpanel.raid', { n: raid.zombies.length, door: raid.zombies.filter((z) => z.phase === 'door').length, near: raid.zombies.filter((z) => z.phase === 'approach').length }));
    }
    m.lines.push(t('bpanel.defense', { n: defenseDps(state) }));
    const tu = turrets(state);
    const tdef = roomDef('turret');
    m.lines.push(t('bpanel.turrets', { n: tu.filter((x) => x.done).length, max: tdef.max }));
    const off = tu.filter((x) => x.done && !x.on).length;
    if (off > 0) m.lines.push(t('bpanel.turretOff', { n: off }));
    if (state.waiting.length > 0) m.lines.push(t('panel.waiting', { n: state.waiting.length }));
    // 강화
    const next = CONFIG.BUNKER.DOOR_LEVELS[state.door.level];
    const up = canUpgradeDoor(state);
    if (next) m.actions.push({ action: 'upgradeDoor', label: t('action.upgradeDoor', { level: state.door.level + 1, cost: formatCost(next.cost) }), enabled: up.ok, reason: reasonText(up) });
    // 포탑
    const building = tu.find((x) => !x.done);
    if (building) {
      const remain = projectRemainingSec(state, building.id);
      m.lines.push(Number.isFinite(remain)
        ? t('bpanel.turretBuilding', { pct: pct(building.progress), time: formatMMSS(remain) })
        : t('bpanel.turretStopped', { pct: pct(building.progress) }));
      const builders = buildersOf(state, building.id);
      for (const s of builders) m.list.push({ text: survivorLine(s, false), action: 'unassign', arg: s.id, label: t('action.unassign') });
      const full = builders.length >= CONFIG.BUNKER.MAX_BUILDERS;
      const anyone = state.survivors.some(isAvailable);
      m.actions.push({ action: 'addBuilder', arg: building.id, label: t('action.addBuilder'), enabled: !full && anyone, reason: full ? t('reason.full') : anyone ? '' : t('picker.none'), primary: true });
      if (picker && picker.target === building.id) m.picker = simplePicker(state, picker.mode);
    } else if (tu.length < tdef.max) {
      const c = canBuildTurret(state);
      m.actions.push({ action: 'turret', label: t('action.turret', { cost: formatCost(tdef.cost) }), enabled: c.ok, reason: reasonText(c) });
    }
    return m;
  }
  const { floor, col } = sel;
  if (!inBounds(state.bunker, floor, col)) return null;
  m.sub = t('bpanel.floor', { floor });
  const room = roomAt(state, floor, col);
  const dig = digAt(state, floor, col);
  let targetId = null;

  if (dig) {
    m.title = t('room.dig');
    projectLines(state, m, dig.id, dig.progress);
    targetId = dig.id;
  } else if (room && !room.done) {
    m.title = t('room.' + room.type);
    m.lines.push(t('bpanel.stage.' + getBuildStage(room)));
    projectLines(state, m, room.id, room.progress);
    targetId = room.id;
  } else if (room && room.repairing) {
    m.title = t('room.' + room.type);
    m.lines.push(t('bpanel.repairing'));
    projectLines(state, m, room.id, room.progress);
    targetId = room.id;
  } else if (room && room.broken) {
    m.title = t('room.' + room.type);
    m.lines.push(t('bpanel.broken'));
    const c = canRepair(state, room.id);
    m.actions.push({ action: 'repair', arg: room.id, label: t('action.repair', { cost: formatCost(repairCost(room.type)) }), enabled: c.ok, reason: reasonText(c), primary: true });
  } else if (room) {
    const def = roomDef(room.type);
    m.title = t('room.' + room.type);
    m.lines.push(roomEffect(def, room.type));
    if (room.damage > 0) m.lines.push(t('bpanel.roomDamage', { pct: pct(room.damage / CONFIG.RAID_RULES.ROOM_BREAK_HP) }));
    if (room.type !== 'shaft') {
      m.lines.push(!room.connected ? t('bpanel.disconnected') : room.on ? t('bpanel.on') : t('bpanel.off'));
      if (def.use > 0) m.lines.push(t('bpanel.use', { n: def.use }));
    }
    if (def.perWorker && room.on) {
      let e = 0;
      for (const s of workerMap(state).get(room.id) || []) e += s.specialty === def.specialty ? 1 + CONFIG.BUNKER.WORK_SPECIALTY_BONUS : 1;
      m.lines.push(t('bpanel.gen', { n: def.perWorker * e }));
    }
    if (def.workers > 0) {
      const workers = workersOf(state, room.id);
      m.lines.push(t('bpanel.workers', { n: workers.length, max: def.workers }));
      for (const s of workers) m.list.push({ text: survivorLine(s, false), action: 'unassign', arg: s.id, label: t('action.unassign') });
      const anyone = state.survivors.some(isAvailable);
      const full = workers.length >= def.workers;
      m.actions.push({ action: 'addWorker', arg: room.id, label: t('action.addWorker'), enabled: !full && anyone, reason: full ? t('reason.full') : anyone ? '' : t('picker.none'), primary: true });
      targetId = room.id;
    }
    if (room.type === 'workshop') {
      if (room.craft) {
        m.lines.push(t('bpanel.craft', { item: t('item.' + room.craft.item), pct: pct(room.craft.progress) }));
        if (!room.on || workersOf(state, room.id).length === 0) m.lines.push(t('bpanel.craftNeed'));
      } else {
        for (const item of Object.keys(CONFIG.BUNKER.CRAFTS)) {
          const c = canCraft(state, room.id, item);
          m.actions.push({ action: 'craft', arg: item, label: t('action.craft', { item: t('item.' + item), cost: formatCost(CONFIG.BUNKER.CRAFTS[item].cost) }), enabled: c.ok, reason: reasonText(c) });
        }
      }
      if (state.items.weapon) m.lines.push(t('bpanel.weapons', { n: state.items.weapon }));
      if (state.items.tool) m.lines.push(t('bpanel.stored', { item: t('item.tool'), n: state.items.tool }));
      if (state.items.gear) m.lines.push(t('bpanel.stored', { item: t('item.gear'), n: state.items.gear }));
    }
  } else if (!isDug(state, floor, col)) {
    m.title = t('room.dirt');
    m.lines.push(t('bpanel.dirt'));
    m.lines.push(t('bpanel.digInfo', { wood: CONFIG.BUNKER.DIG.cost.wood, sec: CONFIG.BUNKER.DIG.sec }));
    const c = canDig(state, floor, col);
    m.actions.push({ action: 'dig', label: t('action.dig'), enabled: c.ok, reason: reasonText(c), primary: true });
  } else {
    m.title = t('room.empty');
    const shaftCol = col === CONFIG.BUNKER.SHAFT_COL;
    m.lines.push(t(shaftCol ? 'bpanel.shaftSlot' : 'bpanel.empty'));
    const types = shaftCol ? ['shaft'] : CONFIG.BUNKER.BUILD_MENU;
    m.menu = {
      title: t('bpanel.menu'),
      items: types.map((type) => {
        const c = canBuild(state, type, floor, col);
        const def = roomDef(type);
        return {
          action: 'build', arg: type,
          label: t('room.' + type) + ' · ' + formatCost(def.cost),
          sub: c.ok ? roomEffect(def, type) : reasonText(c),
          enabled: c.ok,
        };
      }),
    };
  }

  if (picker && targetId !== null && picker.target === targetId) m.picker = simplePicker(state, picker.mode);
  return m;
}

/** 단면도에 그릴 방 상태 (테스트용 요약) */
export function roomViewState(room) {
  if (!room.done) return getBuildStage(room);
  if (room.type === 'shaft') return 'on';
  if (!room.connected) return 'disconnected';
  return room.on ? 'on' : 'off';
}

// ---------- 1일차 가이드 ----------
const roomCell = (state, type) => {
  const r = state.bunker.rooms.find((x) => x.type === type);
  return r ? { floor: r.floor, col: r.col } : null;
};

/**
 * 가이드 카드 내용과 가리킬 곳. 가이드가 끝났거나 건너뛰었으면 null.
 * target = { view: 'surface', tile } | { view: 'bunker', cell: { floor, col } }
 */
export function tutorialModel(state) {
  const step = currentStep(state);
  if (!step) return null;
  const TU = CONFIG.TUTORIAL;
  const n = state.tutorial.step + 1;
  const total = TUTORIAL_STEPS.length;
  let key = 'guide.' + step;
  let target = null;
  const extra = [];
  const anyone = state.survivors.some(isAvailable);
  switch (step) {
    case 'gen': target = { view: 'bunker', cell: roomCell(state, 'generator') }; break;
    case 'water': target = { view: 'bunker', cell: roomCell(state, 'water') }; break;
    case 'dig': target = { view: 'bunker', cell: { ...TU.DIG_CELL } }; break;
    case 'explore': {
      const size = state.surface.size;
      let tile = tileIndex(size, TU.EXPLORE_TILE.x, TU.EXPLORE_TILE.y);
      if (!canExplore(state, tile).ok) tile = state.surface.tiles.findIndex((tt, i) => canExplore(state, i).ok);
      target = tile >= 0 ? { view: 'surface', tile } : null;
      break;
    }
    case 'guard': {
      const dig = state.bunker.digs.find((d) => d.floor === TU.DIG_CELL.floor && d.col === TU.DIG_CELL.col);
      if (dig) extra.push(t('guide.waitDig'));
      if (guardCellFree(state)) target = { view: 'bunker', cell: { ...TU.DIG_CELL } };
      else key = 'guide.guardAny';
      break;
    }
    case 'guardman': {
      const g = state.bunker.rooms.find((r) => r.type === 'guard');
      if (g && !g.done) extra.push(t('guide.waitBuild'));
      target = g ? { view: 'bunker', cell: { floor: g.floor, col: g.col } } : null;
      break;
    }
    case 'gather': {
      const tile = state.surface.tiles.findIndex((tt) => tt.type === 'ruins' && tt.revealed && !isDepleted(tt));
      target = tile >= 0 ? { view: 'surface', tile } : null;
      if (isNight(state)) extra.push(t('guide.night'));
      break;
    }
    default:
  }
  if (!anyone && step !== 'guard' && !extra.length) extra.push(t('guide.noIdle'));
  return { step, title: t('guide.title', { n, total }), body: t(key), extra: extra.join(' '), target };
}

// ---------- 일차별 미션 ----------
function goalText(m) {
  const g = m.goal;
  const p = { cur: m.cur, need: m.need };
  if (g.kind === 'build') return t('goal.build', { ...p, room: t('room.' + g.room) });
  return t('goal.' + g.kind, p);
}

function mustText(m) {
  if (m.id === 'defense') {
    if (m.repelled) return t('mission.repelled');
    if (m.need === Infinity) return t('mission.defenseImpossible', m.params);
    return t('mission.defense', { n: m.params.n, cur: m.cur, need: m.need });
  }
  return t('mission.' + m.id, { cur: m.cur, need: m.need });
}

/** 미션 카드. 가이드 중이면 null (가이드가 먼저) */
export function missionModel(state) {
  if (isTutorialActive(state) || state.outcome) return null;
  const list = dayMissions(state);
  const must = list.filter((m) => m.survival);
  const goals = list.filter((m) => !m.survival);
  const mustDone = must.filter((m) => m.done).length;
  const goalDone = goals.filter((m) => m.done).length;
  const defense = must.find((m) => m.id === 'defense');
  const day = getDay(state);
  const bigMult = bigRaidMult(day + 1);
  return {
    note: bigMult > 1 ? t('mission.bigTomorrow', { mult: bigMult }) : '',
    title: t('mission.title', { day: getDay(state) }),
    summary: t('mission.summary', { a: mustDone, b: must.length, c: goalDone, d: goals.length }),
    must: must.map((m) => ({ text: mustText(m), done: m.done })),
    how: defense && !defense.done && !defense.repelled ? t('mission.defenseHow') : '',
    goals: goals.map((m) => ({ text: goalText(m), done: m.done })),
    allMust: mustDone === must.length,
    allDone: mustDone === must.length && goalDone === goals.length,
  };
}

/** 지금 단계에서 반짝일 패널 버튼 */
export function tutorialButtons(step) {
  return {
    gen: ['[data-action="addWorker"]', '[data-action="assign"]'],
    water: ['[data-action="addWorker"]', '[data-action="assign"]'],
    dig: ['[data-action="dig"]', '[data-action="assign"]'],
    explore: ['[data-action="explore"]', '[data-action="pick"]', '[data-action="depart"]'],
    guard: ['[data-action="build"][data-arg="guard"]', '[data-action="assign"]'],
    guardman: ['[data-action="addWorker"]', '[data-action="assign"]'],
    gather: ['[data-action="gather"]', '[data-action="assign"]'],
  }[step] || [];
}

/** 패널을 다시 그릴지 판단하는 키 */
export function panelKey(m) {
  return m ? JSON.stringify(m) : '';
}

export { isNight };
