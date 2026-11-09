# CLAUDE.md — LASTGATE (가칭)

이 저장소(`dusthold`)는 영주의 새 게임을 만드는 곳이다.
장르: **아이들 아케이드 + 타워디펜스** — 성주를 조이스틱으로 움직여 은화를 모으고, 바닥 패드에 넣어
건물·궁수·망루·성벽을 해금하며, 길을 따라 오는 적 웨이브와 거인을 막는다.

개발은 두 단계다.
1. **브라우저 프로토타입** (지금) — 저장소 루트. 폰에서 GitHub Pages로 바로 플레이하며 재미를 검증.
2. **Unity 이식** (나중) — `unity/` 폴더. 브라우저 버전의 규칙·수치를 그대로 옮긴다. → `design/unity-port.md`

> 이전 게임 DUSTHOLD는 `archive-dusthold` 브랜치에 보관되어 있다. main에서는 다루지 않는다.

## 작업 시작 전에 반드시

1. `design/plan.md`(기획서)를 끝까지 읽는다. **수치·규칙·완료 기준의 기준은 이 문서다.**
2. 기획서 상단 상태가 "승인 대기"이면 게임 코드를 쓰지 않는다. 영주에게 승인·수정 사항을 먼저 받는다.
3. `design/progress.md`에서 현재 마일스톤과 마지막 작업을 확인한다.
4. 기획서에 없는 기능을 임의로 추가하지 않는다. 필요해 보이면 먼저 영주에게 묻고, 기획서를 먼저 고친 뒤 코드에 반영한다.

## 진행 방식

- 마일스톤 순서대로만: **M1 뼈대 → M2 은화·패드 → M3 궁수·웨이브 → M4 성벽·보스·승패 → M5 다듬기 → M6 아트.**
- 한 번에 한 마일스톤. 끝나면:
  1. plan.md ⑥의 해당 완료 기준을 테스트로 확인 (`node --test` + 헤드리스 브라우저)
  2. 실패는 원인을 고쳐 다시 돌린다 — 통과할 때까지 (self-check 스킬이 있으면 사용)
  3. `design/progress.md`에 날짜·한 일·통과한 기준·남은 문제를 적는다
  4. main에 커밋·푸시 후 영주에게 **결과만 짧게** 보고하고 다음 마일스톤 진행 여부를 묻는다
- 영주는 비개발자에 가깝다. 보고는 쉬운 한국어로, 폰에서 무엇을 눌러 확인하면 되는지 함께 적는다.

## 기술 규칙 (브라우저 프로토타입)

- **빌드 도구 금지.** `index.html` + ES 모듈. npm 패키지는 런타임에 쓰지 않는다(테스트는 Node 기본 `node --test`).
- **3D = Three.js 0.187**, `vendor/three/`에 들어 있다. importmap으로 `"three": "./vendor/three/three.module.js"` 연결.
  `three.module.js`는 `three.core.js`를 import하므로 두 파일을 항상 같이 둔다. 애드온이 필요하면 같은 버전을 `vendor/three/addons/`에 넣는다. CDN 의존 금지.
- **로직/화면 분리 (Unity 이식의 핵심):**
  - `js/sim/**` = 게임 규칙. `document`, `window`, Three.js를 **절대** import하지 않는다. 순수 함수 + 평범한 상태 객체만.
  - `js/render/**` = Three.js 그리기, `js/input/**` = 터치·키보드. sim 상태를 읽기만 한다.
  - 좌표는 바닥 평면 `x, z`(미터) + 각도(라디안)만 sim에 둔다. 높이·애니메이션은 render의 일.
- **모든 수치는 `data/balance.json`에만.** 코드 안 매직 넘버 금지. 밸런싱은 이 파일만 고친다. (Unity도 같은 JSON을 읽는다)
- **고정 타임스텝**: sim 1틱 = 0.05초(20Hz). 화면은 보간해서 그린다.
- **시드 랜덤**: `js/sim/rng.js`만 사용. `Math.random()` 금지(연출용 파티클 제외). 같은 시드 = 같은 결과.
- 모바일 세로 우선(390×844 기준), 버튼 최소 44px, 터치 조이스틱. PC 키보드(WASD)·마우스도 동작.
- `devicePixelRatio` 최대 2. 같은 종류 물체(적·궁수·은화·나무)는 InstancedMesh. plan.md "성능 상한"을 넘지 않는다.
- 디버그: 주소 뒤 `?worst` → 최악 장면 + FPS 표시, `?seed=123` → 시드 고정, `?fast` → 4배속.
- UI 텍스트는 한국어, 문자열은 `js/strings.js`에 모은다.

## 폴더

```
index.html  css/  data/balance.json  vendor/three/
js/main.js  js/strings.js
js/sim/      state · rng · commander · coins · pads · units · combat · waves · rules
js/render/   scene · camera · instanced · hud · fx
js/input/    joystick · keyboard
tests/       *.test.js (node --test 기본 패턴)
design/      plan.md · progress.md · unity-port.md
unity/       (Unity 단계에서 생성)
```

## 실행·확인

- 로컬: 저장소 폴더에서 `python3 -m http.server 8000` → 브라우저로 `localhost:8000`
- 테스트: `npm test` (= `node --test`, `tests/*.test.js`를 자동으로 찾음)
- 폰 확인: GitHub Pages(main 브랜치 루트) → https://kevin-kim98.github.io/dusthold/

## 아트 규칙

- M1~M5는 단순 도형(박스·원기둥·구)과 색만으로 동작해야 한다. 이미지·모델 파일이 없어도 돌아가야 한다.
- M6에서 `assets/`에 모델·텍스처를 넣어 교체. 파일이 없으면 도형으로 자동 대체.
- 이미지·3D 에셋 생성은 영주가 요청할 때만. 항목당 1개, 재생성은 영주가 요청할 때만.

## 지식재산 규칙 (중요)

- 이 게임은 같은 장르의 **오리지널** 게임이다.
- 참고한 광고의 게임 이름(Kingshot·킹샷), 제작사 이름, 원작 캐릭터·로고·UI·아트를 **이름·코드·파일명·이미지 어디에도 쓰지 않는다.**
- 원작 화면을 따라 그리지 않는다. 성주·궁수·적·건물 디자인은 새로 만든다.
