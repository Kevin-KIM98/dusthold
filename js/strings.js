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

    'tile.entrance': '벙커 입구',
    'tile.fog': '안개',
    'tile.forest': '숲',
    'tile.ruins': '폐허',
    'tile.farm': '농지',
    'tile.reservoir': '저수지',
    'tile.box': '보급 상자',
    'tile.camp': '생존자 캠프',
    'tile.nest': '좀비 둥지',
    'tile.base': '군 기지',
    'tile.barren': '빈 터',

    'panel.ring': '거리 {ring}',
    'panel.fog': '안개에 가려져 있다',
    'panel.explorable': '탐험 가능 · 왕복 {sec}초',
    'panel.notAdjacent': '밝혀진 땅과 붙어 있지 않다',
    'panel.deposit': '남은 양 {n}',
    'panel.depositInf': '남은 양 무한',
    'panel.yield': '{res} {n}/일/인',
    'panel.workers': '채집 중 {n}명',
    'panel.exhausted': '자원이 바닥났다',
    'panel.required': '필요 전투력 {n}',
    'panel.cleared': '소탕 완료',
    'panel.nestWarn': '내버려 두면 밤 습격 +{n}마리',
    'panel.baseInfo': '통신부품이 있다',
    'panel.expedition': '원정 중 ({n}명) · 귀환까지 {time}',
    'panel.entrance': '우리 벙커. 지상 채집은 낮에만, 밤엔 자동 귀환.',
    'panel.night': '밤에는 채집할 수 없다',
    'panel.oneTime': '탐험하면 바로 얻는다',
    'panel.waiting': '입구 대기 {n}명 (숙소 필요)',
    'panel.barren': '더 얻을 것이 없다',

    'action.explore': '탐험',
    'action.attack': '공격',
    'action.gather': '+ 배치',
    'action.unassign': '빼기',
    'action.depart': '출발 ({n}명)',
    'action.cancel': '취소',

    'picker.explore': '원정대 고르기 (1~{max}명)',
    'picker.attack': '공격대 고르기 (1~{max}명)',
    'picker.gather': '채집할 사람 고르기',
    'picker.power': '전투력 {power} / 필요 {need}',
    'picker.none': '보낼 수 있는 사람이 없다 (쉬는 중·부상 아님)',

    'survivor.line': '{name} · {spec} · 체력 {hp}',
    'survivor.injured': '부상',
    'survivor.power': '전투력 {n}',
    'picker.warnWeak': '전투력이 모자라면 전원 부상으로 돌아온다',
    'picker.chosen': '{n}명 선택',
    'survivor.job.rest': '휴식',
    'survivor.job.gather': '채집',
    'survivor.job.expedition': '원정',

    'reason.notFog': '이미 밝혀진 땅',
    'reason.notAdjacent': '밝혀진 땅과 붙어 있어야 한다',
    'reason.busy': '이미 원정대가 가는 중',
    'reason.noMembers': '최소 1명',
    'reason.tooMany': '최대 {max}명',
    'reason.unavailable': '쉬고 있고 부상 없는 사람만',
    'reason.notTarget': '공격할 대상이 아니다',
    'reason.cleared': '이미 소탕했다',
    'reason.notGatherable': '채집할 수 없는 땅',
    'reason.night': '밤에는 채집할 수 없다',
    'reason.exhausted': '자원이 바닥났다',
    'reason.notRevealed': '아직 밝혀지지 않았다',

    'reward.food': '식량 +{n}',
    'reward.water': '물 +{n}',
    'reward.wood': '목재 +{n}',
    'reward.scrap': '고철 +{n}',
    'reward.parts': '통신부품 +{n}',

    'log.depart': '{tile}(거리 {ring})로 {n}명 출발',
    'log.exploreDone': '{tile} 탐험 완료 · {reward}',
    'log.found': '{tile} 발견 · 필요 전투력 {need}',
    'log.camp': '생존자 캠프에서 {names} 합류',
    'log.campWait': '{n}명은 숙소가 없어 입구에서 대기',
    'log.nestCleared': '{tile} 소탕 · {reward}',
    'log.baseCleared': '군 기지 확보 · {reward}',
    'log.attackFailed': '{tile} 공격 실패 · 원정대 전원 부상',
    'log.closeFight': '격전 · {name} 체력 -{n}',
    'log.gatherersReturn': '밤이 되어 채집 인원 {n}명 귀환',
    'log.exhausted': '{tile} 자원이 바닥났다',
    'log.joined': '{name} 입주',

    'toast.returned': '원정대 귀환 · {tile}',
    'toast.attackFailed': '공격 실패! 전원 부상',
    'toast.gatherersReturn': '채집 인원 귀환',

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
