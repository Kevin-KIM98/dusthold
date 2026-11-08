// DUSTHOLD — 모든 수치는 이 파일에만 둔다. 코드 안 매직 넘버 금지.
// 밸런싱은 여기만 고친다. (기준: design/plan.md)

export const CONFIG = Object.freeze({
  SAVE: Object.freeze({
    KEY: 'dusthold.save.v1',      // localStorage 키
    VERSION: 1,                    // 저장 구조 버전. 구조가 바뀌면 올린다.
    AUTOSAVE_INTERVAL_SEC: 10,     // 실시간 기준 자동 저장 주기
  }),

  TIME: Object.freeze({
    TICK_SEC: 0.1,                 // 시뮬레이션 1틱 = 0.1초 (고정 타임스텝)
    DAY_SEC: 240,                  // 하루 길이
    DAYLIGHT_SEC: 180,             // 낮 길이 (이후는 밤)
    SPEEDS: Object.freeze([1, 2, 3]),
    DEFAULT_SPEED: 1,
    MAX_FRAME_DT_SEC: 0.25,        // 한 프레임이 이보다 길면 잘라냄 (탭 복귀 시 폭주 방지)
    MAX_TICKS_PER_FRAME: 30,       // 한 프레임에 처리하는 최대 틱 수
    CLOCK_START_HOUR: 6,           // 하루 0초 = 06:00 (낮 06:00~24:00, 밤 00:00~06:00)
    RAID_WARNING_SEC: 30,          // 습격(밤) 몇 초 전에 경고 토스트
  }),

  START: Object.freeze({
    RESOURCES: Object.freeze({ food: 20, water: 20, wood: 40, scrap: 25, parts: 0 }),
    SURVIVORS: 4,
    POP_CAP: 6,
    STORAGE_CAP: 150,
  }),

  SURVIVOR: Object.freeze({
    HP: 100,
    INJURED_HP: 40,
    FOOD_PER_DAY: 2,
    WATER_PER_DAY: 2,
    SPECIALTIES: Object.freeze(['gather', 'build', 'combat', 'tech']),
    // 오리지널 이름 풀 (원작 캐릭터 이름 사용 금지)
    NAMES: Object.freeze([
      '도윤', '하린', '세준', '미르', '태오', '가온',
      '유빈', '재하', '소율', '은호', '다온', '시우',
    ]),
  }),

  RESOURCE_ORDER: Object.freeze(['food', 'water', 'wood', 'scrap', 'power', 'parts']),

  UI: Object.freeze({
    DPR_MAX: 2,                    // devicePixelRatio 상한
    MIN_TOUCH_PX: 44,              // 버튼 최소 크기
    LOG_MAX: 200,                  // 기록 탭 최대 줄 수
    TOAST_SEC: 3,                  // 토스트 표시 시간
    FPS_SMOOTHING: 0.1,            // FPS 표시 지수평활 계수
    MOBILE_W: 390,
    MOBILE_H: 844,
  }),

  INPUT: Object.freeze({
    KEY_PAUSE: ' ',
    KEY_SPEED: Object.freeze({ '1': 1, '2': 2, '3': 3 }),
    KEY_TOGGLE_VIEW: 'Tab',
    KEY_CLOSE: 'Escape',
    KEY_DEBUG: 'F9',
  }),
});
