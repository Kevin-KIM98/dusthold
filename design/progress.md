# 진행 로그

## 2026-11-10 — 저장소 초기화
- 기존 DUSTHOLD 파일을 main에서 모두 삭제 (전체 코드는 `archive-dusthold` 브랜치에 보관)
- 새 게임용 CLAUDE.md·README·진행 로그만 남김
- 다음: 기획서(design/plan.md) 작성 → 영주 승인 → M1 시작

## 2026-11-10 — 기획서 초안 + 개발 환경
- `design/plan.md` 초안 작성 (가칭 LASTGATE, 10웨이브, M1~M6 완료 기준·성능 상한) — **승인 대기**
- `design/unity-port.md` — 브라우저 → Unity 이식 계획 (sim 1:1 번역, balance.json 공유)
- Three.js 0.187을 `vendor/three/`에 넣음 (three.module.js + three.core.js)
- CLAUDE.md(작업 지침), README, package.json(`npm test`), .gitignore(Unity 포함)
- 다음: 영주 승인 → M1 뼈대

## 2026-11-09 — 기획서 승인 + M1 뼈대 완료
- 영주가 기획서 승인 → plan.md 상태 "승인됨"
- 만든 것
  - `index.html` + importmap(Three.js 0.187, vendor) + `css/style.css` — 빌드 도구 없음
  - sim: `rng`(시드 랜덤) · `state`(맵 생성: 나무 70·바위 16을 길·성채를 피해 시드로 배치) · `collision` · `commander`(이동·회전·충돌) · `rules`(20Hz 1틱)
  - render: 바닥·길 2개(남·동)·성채(본관+탑 4+성문)·나무/바위 InstancedMesh·뿔양 기수 성주, 그림자 1개, 쿼터뷰 따라가는 카메라(화면 비율에 맞춰 거리 자동)
  - input: 어디든 누르면 생기는 조이스틱(터치·마우스), WASD·화살표
  - 일시정지 버튼(48px), 첫 이동 안내 문구, `?seed=` `?fast` `?worst`(FPS 표시)
  - 수치는 전부 `data/balance.json` (맵 크기·성주 속도·카메라 각도/거리·조이스틱 크기 등)
- 통과한 기준 (M1 5개 모두) — `npm test` 16개 통과
  - 화면(바닥·길·성채·나무) 표시 + 콘솔 에러 0, draw call ≤150 (헤드리스 브라우저)
  - 터치 드래그 → 조이스틱 표시·그 방향 이동, 손 떼면 정지 / 마우스 드래그 / WASD 4방향
  - 카메라가 성주를 따라감 / 성채·나무·바위·맵 경계 통과 불가
  - Node 로직 테스트 10개 (시드 결정론, 충돌, 이동 속도, sim 순수성 검사 포함)
- 남은 문제·메모
  - `?worst`는 지금은 FPS만 표시. 적·궁수·은화가 생기는 M3~M5에서 최악 장면을 채운다
  - 헤드리스 브라우저는 소프트웨어 그래픽이라 FPS가 낮게 나옴(10) → 실제 폰 FPS는 M5에서 측정
  - 모델 크기·색 같은 "보이는 모양" 값은 render 코드 안에 있음(규칙 수치는 아님). 아트 교체(M6) 때 정리
- 다음: M2 은화와 패드
