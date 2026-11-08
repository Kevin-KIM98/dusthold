// DUSTHOLD — 모든 수치는 이 파일에만 둔다. 코드 안 매직 넘버 금지.
// 밸런싱은 여기만 고친다. (기준: design/plan.md)

export const CONFIG = Object.freeze({
  SAVE: Object.freeze({
    KEY: 'dusthold.save.v1',      // localStorage 키
    VERSION: 2,                    // 저장 구조 버전. 구조가 바뀌면 올린다. (2: M2 지상 맵 추가)
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

  // ---------- 지상 (plan.md ① 지상 타일) ----------
  SURFACE: Object.freeze({
    SIZE: 11,                      // 11×11, 중앙 = 벙커 입구 (링 0)
    MAP_SEED_SALT: 0x9e3779b9,     // 맵 전용 난수 줄기 (같은 시드 = 같은 맵)
    START_REVEAL_RING: 1,          // 시작 시 링 1까지(8칸) 밝힘
    START_GUARANTEE: Object.freeze(['forest', 'ruins', 'farm']), // 시작 8칸에 반드시 1개씩
    EXPEDITION_SEC_PER_RING: 20,   // 원정 소요 = 20초 × 링 (왕복 포함)
    EXPEDITION_MIN: 1,
    EXPEDITION_MAX: 3,
    GATHER_SPECIALTY_BONUS: 0.5,   // 채집 특기 +50%
    // 타일 종류. deposit null = 무한. reward = 탐험 보상. gather = 채집 (perDay = /일/인)
    TILES: Object.freeze({
      forest:    Object.freeze({ minRing: 1, reward: Object.freeze({ wood: 15 }),  gather: Object.freeze({ res: 'wood', perDay: 6 }),  deposit: 120 }),
      ruins:     Object.freeze({ minRing: 1, reward: Object.freeze({ scrap: 10 }), gather: Object.freeze({ res: 'scrap', perDay: 4 }), deposit: 80 }),
      farm:      Object.freeze({ minRing: 1, reward: Object.freeze({ food: 10 }),  gather: Object.freeze({ res: 'food', perDay: 5 }),  deposit: 100 }),
      reservoir: Object.freeze({ minRing: 2, reward: Object.freeze({ water: 15 }), gather: Object.freeze({ res: 'water', perDay: 6 }), deposit: null }),
      box:       Object.freeze({ minRing: 1, oneTime: true, randomReward: Object.freeze({ min: 20, max: 40, pool: Object.freeze(['food', 'water', 'wood', 'scrap']) }) }),
      camp:      Object.freeze({ minRing: 2, oneTime: true, survivors: Object.freeze({ min: 1, max: 2 }) }),
      nest:      Object.freeze({ minRing: 2, powerPerRing: 10, clearReward: Object.freeze({ scrap: 30 }), raidBonus: 2, raidBonusMaxRing: 3 }),
      // 군 기지: 맵에 1곳 고정, 요구 전투력 45 (plan v0.1 그대로. 3명 최대 전투력과의 관계는 progress.md 메모 참고)
      base:      Object.freeze({ minRing: 4, maxRing: 5, count: 1, powerRequired: 45, clearReward: Object.freeze({ parts: 1, scrap: 40 }) }),
    }),
    // 링별 등장 비율 (가중치). 군 기지는 따로 1곳 배치.
    RING_WEIGHTS: Object.freeze({
      1: Object.freeze({ forest: 30, ruins: 25, farm: 25, box: 20 }),
      2: Object.freeze({ forest: 22, ruins: 18, farm: 15, reservoir: 14, box: 10, camp: 8, nest: 13 }),
      3: Object.freeze({ forest: 20, ruins: 18, farm: 14, reservoir: 12, box: 10, camp: 8, nest: 18 }),
      4: Object.freeze({ forest: 20, ruins: 18, farm: 12, reservoir: 10, box: 8, camp: 8, nest: 24 }),
      5: Object.freeze({ forest: 18, ruins: 18, farm: 10, reservoir: 10, box: 8, camp: 8, nest: 28 }),
    }),
  }),

  // ---------- 전투 (원정 즉시 판정) ----------
  COMBAT: Object.freeze({
    BASE_POWER: 5,
    SPECIALTY_POWER: 8,            // 전투 특기
    WEAPON_POWER: 5,               // 무기 소지 시 +5 (작업장 제작, M3)
    CLOSE_FIGHT_MARGIN: 0.5,       // 이겼어도 전투력이 요구치×(1+0.5) 미만이면 (여유가 요구치의 50% 미만)
    CLOSE_FIGHT_HP_LOSS: 20,       // 1명 체력 -20
  }),

  // ---------- 습격 마릿수 공식 (plan.md ③) — 좀비 자체는 M4 ----------
  RAID: Object.freeze({
    BASE: 4,
    PER_DAY: 2,
    // 둥지 1곳당 +마릿수·적용 링은 SURFACE.TILES.nest(raidBonus, raidBonusMaxRing)
    MAX: 40,
    BIG_EVERY_DAYS: 5,
    BIG_MULT: 1.5,
  }),

  // ---------- 카메라·터치 ----------
  CAMERA: Object.freeze({
    TILE_PX: 56,                   // 줌 1일 때 타일 한 변
    ZOOM_MIN: 0.6,
    ZOOM_MAX: 2.0,
    WHEEL_STEP: 0.1,
    CACHE_SCALE: 2,                // 정적 타일 레이어 캐시 해상도 배율
    PAN_MARGIN_TILES: 1,           // 맵 밖으로 끌 수 있는 여유
  }),
  TOUCH: Object.freeze({
    TAP_MAX_PX: 8,                 // 이보다 적게 움직이면 탭
    TAP_MAX_MS: 400,
    LONG_PRESS_MS: 500,
  }),

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
