// DUSTHOLD — 모든 수치는 이 파일에만 둔다. 코드 안 매직 넘버 금지.
// 밸런싱은 여기만 고친다. (기준: design/plan.md)

export const CONFIG = Object.freeze({
  SAVE: Object.freeze({
    KEY: 'dusthold.save.v1',      // localStorage 키
    VERSION: 7,                    // 저장 구조 버전. 구조가 바뀌면 올린다. (2: M2 지상 맵, 3: M3 벙커, 4: M4 습격·도구, 5: M5 결과·통계, 6: 1일차 가이드, 7: 일차별 미션)
    HINTS_KEY: 'dusthold.hints.v1', // 본 튜토리얼 힌트 (기기별, 저장 파일과 따로)
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
    STARVE_HP_LOSS: 30,            // 새벽 정산 때 식량·물이 모자란 인원 체력 감소 (각각)
    FOOD_PER_DAY: 1,               // v0.2 밸런싱: 2 → 1
    WATER_PER_DAY: 1,              // v0.2 밸런싱: 2 → 1
    SPECIALTIES: Object.freeze(['gather', 'build', 'combat', 'tech']),
    // 오리지널 이름 풀 (원작 캐릭터 이름 사용 금지)
    NAMES: Object.freeze([
      '도윤', '하린', '세준', '미르', '태오', '가온',
      '유빈', '재하', '소율', '은호', '다온', '시우',
    ]),
  }),

  RESOURCE_ORDER: Object.freeze(['food', 'water', 'wood', 'scrap', 'power', 'parts']),

  // ---------- 벙커 (plan.md ① 벙커 방, ② 전력망) ----------
  BUNKER: Object.freeze({
    COLS: 7,                       // 최대 7열 × 8층 = 56칸
    MAX_FLOORS: 8,
    SHAFT_COL: 3,                  // 승강기 샤프트 줄 (가운데)
    START_SHAFT_FLOORS: 2,         // 시작 시 1~2층 샤프트
    START_ROOMS: Object.freeze([
      Object.freeze({ type: 'generator', floor: 1, col: 1 }),
      Object.freeze({ type: 'water', floor: 1, col: 4 }),
    ]),
    DIG: Object.freeze({ cost: Object.freeze({ wood: 5 }), sec: 10 }),
    MAX_BUILDERS: 2,               // 공사 하나에 최대 2명
    TWO_BUILDERS_MULT: 0.6,        // 2명이면 시간 ×0.6
    BUILD_SPECIALTY_MULT: 0.67,    // 건설 특기가 있으면 ×0.67
    WORK_SPECIALTY_BONUS: 0.5,     // 방 근무 특기 효율 +50%
    STAGE_FRAME_AT: 0.5,           // 공사 진행 50%부터 골조 그림 (그 전은 비계)
    // use = 전력 소비, perWorker = 근무자 1명당 전력 생산, workers = 근무 최대
    // v0.2 밸런싱: 발전실 6 → 10, 정수실·수경재배실 4 → 10
    // specialty = 이 방에서 +50% 효율을 내는 특기 (기획서는 "특기 일 배치 시 +50%"만 정함 → 짝은 여기서 정함)
    ROOMS: Object.freeze({
      shaft:     Object.freeze({ w: 1, cost: Object.freeze({ wood: 10 }), sec: 10, use: 0, workers: 0 }),
      generator: Object.freeze({ w: 2, cost: Object.freeze({ scrap: 25, wood: 10 }), sec: 30, use: 0, perWorker: 10, workers: 2, specialty: 'tech' }),
      water:     Object.freeze({ w: 2, cost: Object.freeze({ scrap: 15, wood: 10 }), sec: 25, use: 3, workers: 2, produce: Object.freeze({ res: 'water', perDay: 10 }), specialty: 'tech' }),
      farm:      Object.freeze({ w: 2, cost: Object.freeze({ wood: 20, scrap: 10 }), sec: 25, use: 3, workers: 2, produce: Object.freeze({ res: 'food', perDay: 10 }), specialty: 'gather' }),
      quarters:  Object.freeze({ w: 2, cost: Object.freeze({ wood: 20 }), sec: 20, use: 1, workers: 0, popCap: 4 }),
      storage:   Object.freeze({ w: 1, cost: Object.freeze({ wood: 15 }), sec: 15, use: 0, workers: 0, storageCap: 100 }),
      workshop:  Object.freeze({ w: 2, cost: Object.freeze({ wood: 20, scrap: 20 }), sec: 30, use: 4, workers: 2, specialty: 'tech' }),
      guard:     Object.freeze({ w: 1, cost: Object.freeze({ scrap: 20 }), sec: 20, use: 2, workers: 2, dpsPerGuard: 5, specialty: 'combat' }),
      medbay:    Object.freeze({ w: 2, cost: Object.freeze({ wood: 15, scrap: 15 }), sec: 25, use: 3, workers: 1, healPerDay: 40, specialty: 'tech' }),
      radio:     Object.freeze({ w: 2, cost: Object.freeze({ scrap: 80, wood: 40, parts: 1 }), sec: 60, use: 10, workers: 1, specialty: 'tech' }),
      // 자동 포탑: 방폭문에 붙인다 (단면도 칸을 차지하지 않음). 최대 2기
      turret:    Object.freeze({ w: 1, cost: Object.freeze({ scrap: 40 }), sec: 25, use: 4, workers: 0, dps: 8, max: 2, attach: 'door' }),
    }),
    BUILD_MENU: Object.freeze(['generator', 'water', 'farm', 'quarters', 'storage', 'workshop', 'guard', 'medbay', 'radio']),
    // 전력 부족 시 앞쪽이 끝까지 켜져 있다 (뒤쪽부터 꺼짐). turret = 자동 포탑 (M4)
    POWER_PRIORITY: Object.freeze(['guard', 'turret', 'water', 'farm', 'medbay', 'workshop', 'quarters', 'radio']),
    // 작업장 제작. 제작 시간은 기획서에 없어 30초(1명 기준)로 정함. 완성품은 1인 1개씩 자동 장착.
    CRAFTS: Object.freeze({
      weapon: Object.freeze({ cost: Object.freeze({ scrap: 15 }), sec: 30 }),
      tool: Object.freeze({ cost: Object.freeze({ wood: 10, scrap: 5 }), sec: 30 }),
      gear: Object.freeze({ cost: Object.freeze({ scrap: 20 }), sec: 30 }),
    }),
    TOOL_SPEED_BONUS: 0.25,        // 도구: 가진 사람의 채집 속도 +25%, 공사에 도구 가진 사람이 있으면 건설 속도 +25%
    GEAR_TIME_MULT: 0.75,          // 탐사 장비: 원정대에 가진 사람이 있으면 원정 시간 ×0.75
    REPAIR: Object.freeze({ costRatio: 0.3, sec: 10 }), // 고장 난 방 수리: 건설비 30% (올림) + 10초 (1명 기준)
    DOOR_LEVELS: Object.freeze([
      Object.freeze({ hp: 300 }),
      Object.freeze({ hp: 600, cost: Object.freeze({ scrap: 40 }) }),
      Object.freeze({ hp: 1000, cost: Object.freeze({ scrap: 80, wood: 20 }) }),
    ]),
  }),

  // 벙커 단면도 그리기 (줌 1 기준 픽셀)
  BUNKER_VIEW: Object.freeze({
    CELL_W: 60,
    CELL_H: 70,
    SKY_H: 110,                    // 지표면 위 하늘 + 풀 띠
    GRASS_H: 10,
    SIDE: 20,                      // 좌우 흙 여백
    BOTTOM: 30,
    CACHE_SCALE: 2,
    CACHE_SCALE_MAX: 3,            // 배경 캐시 해상도 상한 (줌 × 기기 배율, 메모리 보호)
    ZOOM_SETTLE_MS: 250,           // 확대·축소가 멈추고 이만큼 지나면 배경 캐시를 새 배율로 다시 그린다
    FIGURE_HIT_PX: 22,             // 길게 눌러 사람 잡기 반경
    DIG_PARTICLES_PER_SEC: 14,
    SPARKLE_COUNT: 24,
    SOIL_TILE: 64,                 // 흙 텍스처 한 칸 크기 (월드 px)
    SOIL_BLEND_BANDS: 12,          // 위쪽 흙 → 깊은 흙을 섞는 단계 수 (한 층 높이)
    STRIP_W: 80,                   // 지표면 풀 띠 이미지 한 장 폭
    PERSON_H: 26,                  // 사람 이미지 높이 (줌 1)
    WORK_FRAME_MS: 350,            // 일하는 사람 2프레임 바꾸는 간격
    LABEL_PX: 11,                  // 방 이름표 글자 크기 (월드 px)
    LABEL_MIN_PX: 8,
    LABEL_PAD: 3,                  // 이름표 띠 안쪽 여백
    LABEL_TOP: 9,                  // 방 위쪽 끝에서 이름표까지 (천장 전선 아래)
    DIG_HINT_INSET: 6,             // 팔 수 있는 칸 점선 테두리 안쪽 여백
    DIG_HINT_ICON: 18,             // 팔 수 있는 칸 가운데 곡괭이 크기
  }),
  // ---------- 타이틀 화면 배경 장면 (이미 있는 그림으로 꾸민 벙커 단면) ----------
  TITLE_SCENE: Object.freeze({
    WORLD_W: 460,                  // 장면 폭 (벙커 화면과 같은 월드 단위, 화면 폭에 맞춰 늘림)
    HORIZON: 0.46,                 // 지표면 높이 (화면 높이 비율)
    SUN: Object.freeze({ x: 0.72, r: 0.16 }),   // 지는 해: 화면 폭 비율 위치·반지름
    ROOMS: Object.freeze([         // [층, 열, 방, 일하는 사람 특기]
      Object.freeze([1, 0, 'storage', null]), Object.freeze([1, 1, 'generator', 'tech']), Object.freeze([1, 3, 'shaft', null]),
      Object.freeze([1, 4, 'water', 'gather']), Object.freeze([1, 6, 'guard', 'combat']),
      Object.freeze([2, 1, 'farm', 'gather']), Object.freeze([2, 3, 'shaft', null]), Object.freeze([2, 4, 'workshop', 'build']),
      Object.freeze([3, 1, 'quarters', null]), Object.freeze([3, 3, 'shaft', null]), Object.freeze([3, 4, 'medbay', 'tech']),
    ]),
    ZOMBIES: Object.freeze([       // [x(월드), 종류] — 왼쪽에서 문으로 다가온다
      Object.freeze([24, 'brute']), Object.freeze([70, 'normal']), Object.freeze([108, 'runner']), Object.freeze([150, 'normal']),
    ]),
    MAX_DPR: 2,
  }),
  FX: Object.freeze({
    MAX_PARTICLES: 150,            // 성능 상한
  }),
  // ---------- 밤 분위기 연출 (화면만, 게임 규칙과 무관) ----------
  AMBIENCE: Object.freeze({
    DUSK_SEC: 20,                  // 밤이 되기 이만큼 전부터 서서히 어두워진다
    DAWN_SEC: 10,                  // 새벽이 되고 이만큼 동안 서서히 밝아진다
    NIGHT_RGB: '6,10,28',          // 밤 어둠 색
    SURFACE_ALPHA: 0.5,            // 지상 화면 밤 어둠 진하기 (최대)
    // 밤 가장자리 어둠은 css/style.css #night-veil (진하기 = 밤 정도)
    BUNKER_SKY_ALPHA: 0.85,        // 벙커 화면 하늘 부분
    BUNKER_UNDER_ALPHA: 0.18,      // 벙커 화면 땅속 (방 불빛이 있어 살짝만)
    SHAKE_SMALL: Object.freeze({ amp: 3, ms: 220 }),   // 방폭문이 맞아 체력이 한 칸 줄 때·방이 부서질 때
    SHAKE_BIG: Object.freeze({ amp: 8, ms: 600 }),     // 방폭문이 부서질 때
    SHAKE_DOOR_STEPS: 10,          // 방폭문 체력을 이만큼 칸으로 나눠, 한 칸 줄 때마다 흔들기
    SHAKE_FREQ_MS: 28,             // 흔들림 빠르기
  }),

  // 성능 측정용 최악 장면 (plan.md ⑥ 성능): 지상 전부 밝힘 + 벙커 40칸 + 좀비 40 + 파티클 150
  WORST: Object.freeze({
    SEED: 4242,
    DAY: 20,                       // 이 날의 습격 = 최대 40마리
    ROOMS_PER_FLOOR: Object.freeze([Object.freeze({ type: 'generator', col: 1 }), Object.freeze({ type: 'farm', col: 4 })]),
    WARMUP_TICKS: 80,              // 일부는 문 앞, 일부는 다가오는 중
    URL_PARAM: 'worst',            // 폰에서 index.html?worst 로 열면 바로 최악 장면
  }),

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
    // v0.2 밸런싱: 채집량 숲 6→12·폐허 4→24·농지 5→10·저수지 6→12, 폐허 보상 10→20·매장량 80→200
    TILES: Object.freeze({
      forest:    Object.freeze({ minRing: 1, reward: Object.freeze({ wood: 15 }),  gather: Object.freeze({ res: 'wood', perDay: 12 }),  deposit: 120 }),
      ruins:     Object.freeze({ minRing: 1, reward: Object.freeze({ scrap: 20 }), gather: Object.freeze({ res: 'scrap', perDay: 24 }), deposit: 200 }),
      farm:      Object.freeze({ minRing: 1, reward: Object.freeze({ food: 10 }),  gather: Object.freeze({ res: 'food', perDay: 10 }),  deposit: 100 }),
      reservoir: Object.freeze({ minRing: 2, reward: Object.freeze({ water: 15 }), gather: Object.freeze({ res: 'water', perDay: 12 }), deposit: null }),
      box:       Object.freeze({ minRing: 1, oneTime: true, randomReward: Object.freeze({ min: 20, max: 40, pool: Object.freeze(['food', 'water', 'wood', 'scrap']) }) }),
      camp:      Object.freeze({ minRing: 2, oneTime: true, survivors: Object.freeze({ min: 1, max: 2 }) }),
      nest:      Object.freeze({ minRing: 2, powerPerRing: 10, clearReward: Object.freeze({ scrap: 30 }), raidBonus: 2, raidBonusMaxRing: 3 }),
      // 군 기지: 맵에 1곳 고정, 요구 전투력 30 (plan v0.2.1 — 일반 생존자 3명이 모두 무기를 들면 10×3 = 30)
      base:      Object.freeze({ minRing: 4, maxRing: 5, count: 1, powerRequired: 30, clearReward: Object.freeze({ parts: 1, scrap: 40 }) }),
    }),
    // 링별 등장 비율 (가중치). 군 기지는 따로 1곳 배치.
    // v0.2 밸런싱: 링 2~3은 둥지를 드물게(첫날 밤 습격 마릿수), 생존자 캠프를 자주(인구 증가)
    RING_WEIGHTS: Object.freeze({
      1: Object.freeze({ forest: 30, ruins: 25, farm: 25, box: 20 }),
      2: Object.freeze({ forest: 22, ruins: 18, farm: 15, reservoir: 14, box: 10, camp: 18, nest: 2 }),
      3: Object.freeze({ forest: 20, ruins: 18, farm: 14, reservoir: 12, box: 10, camp: 14, nest: 4 }),
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

  // ---------- 습격 (plan.md ①좀비, ③적 AI) ----------
  ZOMBIES: Object.freeze({
    // v0.2 밸런싱: 일반 좀비 체력 증가 3/일 → 2/일
    normal: Object.freeze({ hpBase: 20, hpPerDay: 2, hpMult: 1, doorDps: 2, speedMult: 1, fromDay: 1, chance: 1 }),
    runner: Object.freeze({ hpMult: 0.6, doorDps: 2, speedMult: 2, fromDay: 3, chance: 0.2 }),
    brute:  Object.freeze({ hpMult: 3, doorDps: 6, speedMult: 1, fromDay: 5, chance: 0.1 }),
  }),
  RAID_RULES: Object.freeze({
    APPROACH_SEC: 10,              // 맵 가장자리 → 입구 이동 시간 (돌격형은 ÷2)
    STAGGER_SEC: 0.25,             // 한 마리씩 줄지어 오게 하는 간격
    DOOR_REGEN_PER_SEC: 0.01,      // 낮 동안 방폭문 초당 1% 회복
    ROOM_BREAK_HP: 60,             // 침입 좀비가 방 하나를 고장 내는 데 필요한 피해 (좀비의 방폭문 피해와 같은 단위)
    CONTACT_DPS: 20,               // 공격받는 방에 있던 생존자 접촉 1초당 체력 감소
    CONTACT_SEC: 1,                // 접촉 시간: 이만큼 맞고 나면 그 방에서 대피 (휴식)
    DAWN_FIGHT_HP_LOSS: 15,        // 새벽에 남은 침입 좀비를 처치하며 전원 체력 감소
  }),
  RAID: Object.freeze({
    BASE: 4,
    PER_DAY: 2,
    // 둥지 1곳당 +마릿수·적용 링은 SURFACE.TILES.nest(raidBonus, raidBonusMaxRing)
    MAX: 40,
    BIG_EVERY_DAYS: 5,
    BIG_MULT: 1.2,                 // 대규모 습격 배수 (v0.7: 영주 의견으로 1.5 → 1.2, 모든 대규모 습격)
  }),

  // ---------- 1일차 가이드·연습 습격 (plan v0.3) ----------
  TUTORIAL: Object.freeze({
    PRACTICE_DAYS: 1,              // 이 날까지의 밤은 연습 습격
    PRACTICE_RAID: 2,              // 연습 습격 좀비 수
    PRACTICE_DOOR_MIN_HP: 1,       // 연습 습격 중 방폭문 체력 최저 (부서지지 않음)
    DIG_CELL: Object.freeze({ floor: 1, col: 6 }),   // 3·5단계: 정수실 오른쪽 칸 (굴착 → 경비실)
    EXPLORE_TILE: Object.freeze({ x: 5, y: 3 }),      // 4단계: 입구 바로 위 두 칸째 (항상 탐험 가능)
    PULSE_MS: 900,                 // 가리키는 곳 깜빡임 주기
  }),

  // ---------- 일차별 미션 (plan v0.4) ----------
  MISSIONS: Object.freeze({
    MAX_DPS: 400,                  // 필요 방어 화력 계산 상한 (이보다 크면 "지금 문으로는 어렵다")
    DOOR_HP_BUCKET: 25,            // 계산을 아끼려고 예상 문 체력을 이 단위로 내림 (내리면 필요 화력이 조금 커져 안전한 쪽)
    LAST_DAY: 10,                  // 이 날 이후는 이 날의 목표를 계속
    // 목표: kind = build(room, n) · turret(n) · door(level) · explore(n) · armed(n) · nest(n) · baseFound · parts · radio
    GOALS: Object.freeze({
      1: Object.freeze([Object.freeze({ kind: 'explore', n: 2 })]),
      2: Object.freeze([Object.freeze({ kind: 'build', room: 'farm', n: 1 }), Object.freeze({ kind: 'explore', n: 4 })]),
      3: Object.freeze([Object.freeze({ kind: 'build', room: 'workshop', n: 1 }), Object.freeze({ kind: 'armed', n: 1 })]),
      4: Object.freeze([Object.freeze({ kind: 'turret', n: 1 }), Object.freeze({ kind: 'door', level: 2 })]),
      5: Object.freeze([Object.freeze({ kind: 'build', room: 'guard', n: 2 }), Object.freeze({ kind: 'explore', n: 10 })]),
      6: Object.freeze([Object.freeze({ kind: 'armed', n: 3 }), Object.freeze({ kind: 'nest', n: 1 })]),
      7: Object.freeze([Object.freeze({ kind: 'build', room: 'generator', n: 2 }), Object.freeze({ kind: 'build', room: 'medbay', n: 1 })]),
      8: Object.freeze([Object.freeze({ kind: 'baseFound' }), Object.freeze({ kind: 'turret', n: 2 })]),
      9: Object.freeze([Object.freeze({ kind: 'parts' }), Object.freeze({ kind: 'door', level: 3 })]),
      10: Object.freeze([Object.freeze({ kind: 'radio' })]),
    }),
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
    TOAST_MAX: 3,
    ICON_PX: 18,                   // 상단 바 자원 아이콘 크기                  // 한 번에 보이는 토스트 수 (넘치면 오래된 것부터 지움)
    FPS_SMOOTHING: 0.1,            // FPS 표시 지수평활 계수
    MOBILE_W: 390,
    MOBILE_H: 844,
  }),

  INPUT: Object.freeze({
    KEY_PAUSE: ' ',
    KEY_SPEED: Object.freeze({ '1': 1, '2': 2, '3': 3 }),
    KEY_TOGGLE_VIEW: 'Tab',
    KEY_CLOSE: 'Escape',
    KEY_DEBUG: 'F9',               // 최악 장면 + FPS (다시 누르면 원래 게임으로)
  }),
});
