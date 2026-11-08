// UI 문자열. 나중에 영어 추가 가능하도록 언어별로 모아둔다.

export const STRINGS = {
  ko: {
    'title.name': 'DUSTHOLD',
    'title.sub': '지상은 탐험, 지하는 건설. 밤마다 좀비가 문을 두드린다.',
    'title.new': '새 게임',
    'title.newConfirm': '저장을 지우고 새로 시작 (다시 탭)',
    'title.continue': '이어하기',

    'res.food': '식량',
    'res.water': '물',
    'res.wood': '목재',
    'res.scrap': '고철',
    'res.power': '전력',
    'res.parts': '통신부품',
    'res.pop': '인구',

    'clock.day': '{day}일차',
    'clock.phase.day': '낮',
    'clock.phase.night': '밤',
    'clock.toNight': '습격까지 {time}',
    'clock.toDawn': '새벽까지 {time}',

    'speed.pause': '일시정지',
    'speed.x': '×{n}',
    'speed.paused': '멈춤',

    'tab.surface': '지상',
    'tab.bunker': '벙커',
    'tab.log': '기록',

    'panel.title': '선택 정보',
    'panel.none': '선택한 대상이 없습니다',

    'view.surface.placeholder': '지상 맵 — M2에서 만들어집니다',
    'view.bunker.placeholder': '벙커 단면 — M3에서 만들어집니다',

    'log.empty': '아직 기록이 없습니다',
    'log.start': '벙커에 도착했다. 생존자 {n}명.',
    'log.newDay': '{day}일차 아침이 밝았다',
    'log.nightFalls': '밤이 왔다',
    'log.raidWarning': '습격 {sec}초 전',

    'toast.saved': '저장됨',
    'toast.loaded': '이어서 시작합니다',
    'toast.saveBroken': '저장 파일이 맞지 않아 새로 시작합니다',
    'toast.raidWarning': '습격 {sec}초 전! 밤이 온다',
    'toast.nightFalls': '밤이 왔다',
    'toast.newDay': '{day}일차 아침',

    'debug.fps': 'FPS {fps} · 틱 {tick}',

    'spec.gather': '채집',
    'spec.build': '건설',
    'spec.combat': '전투',
    'spec.tech': '기술',
  },
};

export let LANG = 'ko';

export function setLang(code) {
  if (STRINGS[code]) LANG = code;
}

/** 키로 문자열을 찾고 {name} 자리를 params로 채운다. 없는 키는 키 그대로 돌려준다. */
export function t(key, params) {
  const table = STRINGS[LANG] || STRINGS.ko;
  let s = table[key];
  if (s === undefined) return key;
  if (params) {
    for (const k of Object.keys(params)) {
      s = s.split('{' + k + '}').join(String(params[k]));
    }
  }
  return s;
}
