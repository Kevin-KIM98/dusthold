// 상태 → 화면에 쓸 글자/플래그. DOM 없음 (Node에서 테스트). ui.js가 이걸 DOM에 붙인다.

import { CONFIG } from '../config.js';
import { t } from '../strings.js';
import { summarize } from '../sim/economy.js';
import { getDay, getPhase, getClock, getSecondsToPhaseChange } from '../sim/time.js';

function pad2(n) {
  return n < 10 ? '0' + n : String(n);
}

export function formatMMSS(sec) {
  const s = Math.max(0, Math.ceil(sec));
  return Math.floor(s / 60) + ':' + pad2(s % 60);
}

/** 상단 자원 바 7칸: 식량·물·목재·고철·전력·통신부품·인구 */
export function topBarModel(state) {
  const s = summarize(state);
  const items = [];
  for (const id of CONFIG.RESOURCE_ORDER) {
    if (id === 'power') {
      items.push({ id, label: t('res.power'), text: s.power.produced + '/' + s.power.consumed, low: s.power.low });
    } else {
      items.push({ id, label: t('res.' + id), text: String(s[id].value), low: s[id].low });
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
    const day = Math.floor(e.tick / Math.round(CONFIG.TIME.DAY_SEC / CONFIG.TIME.TICK_SEC)) + 1;
    out.push({ dayText: t('clock.day', { day }), text: t(e.key, e.params || undefined) });
  }
  return out;
}
