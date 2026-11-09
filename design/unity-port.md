# Unity 이식 계획

> 브라우저 프로토타입(M1~M5)이 끝나고 재미가 검증된 뒤에 시작한다. 그 전에는 `unity/` 폴더를 만들지 않는다.

## 원칙

브라우저 버전은 "규칙(sim)"과 "그리기(render)"가 나뉘어 있다. Unity로 옮길 때는
**규칙과 수치는 그대로 옮기고, 그리기·입력·연출만 Unity 방식으로 새로 만든다.**

| 브라우저 | Unity | 옮기는 법 |
|---|---|---|
| `data/balance.json` | `unity/Assets/Data/balance.json` (복사) | 같은 파일을 그대로 읽음 → 밸런스 한 곳에서 관리 |
| `js/sim/*.js` | `unity/Assets/Scripts/Sim/*.cs` | 파일 1개 = C# 클래스 1개로 1:1 번역. MonoBehaviour가 아닌 일반 C# 클래스 |
| `js/sim/rng.js` | `Sim/Rng.cs` | 같은 알고리즘·같은 시드 → 같은 결과 |
| `tests/*.test.js` | `unity/Assets/Tests/EditMode/*.cs` | 같은 입력에 같은 결과가 나오는지 Unity Test Framework로 확인 |
| `js/render/*` | `Scripts/View/*` + 프리팹 | Unity 씬·프리팹·애니메이터로 새로 제작 |
| `js/input/*` | `Scripts/Input/*` | Input System 패키지의 가상 조이스틱 |
| 고정 틱 20Hz | `FixedUpdate` 대신 직접 틱 누적(0.05초) | sim은 Unity 시간에 의존하지 않음 |

## 브라우저 단계에서 지킬 것 (이식을 쉽게)

- sim 코드는 클래스·필드 이름을 C#으로 옮기기 쉬운 영어 camelCase로.
- sim 상태는 숫자·문자열·배열·평범한 객체만(함수·DOM·Three 객체 금지).
- 바닥 좌표 `x, z`(미터) 기준. Unity에서도 1단위 = 1미터, Y는 높이.
- 결정론 테스트(같은 시드 10판 = 같은 결과)를 유지 → Unity 번역이 맞는지 같은 테스트로 비교.

## Unity 단계 순서 (예정)

1. **U1 프로젝트 생성** — `unity/` 에 Unity 6 LTS, URP, 세로 1080×1920. `.gitignore`는 루트에 이미 준비됨.
2. **U2 sim 번역** — `Sim/*.cs` + EditMode 테스트가 브라우저 테스트와 같은 결과로 통과.
3. **U3 화면·입력** — 도형 프리팹 + 가상 조이스틱으로 브라우저 버전과 같은 플레이.
4. **U4 아트·연출** — 로우폴리 모델, 파티클, 사운드, 카메라 연출.
5. **U5 모바일 빌드** — 안드로이드(.aab) → iOS. 성능 상한 재측정.

## 저장소 운영

- 같은 `dusthold` 저장소, `unity/` 하위 폴더. 브라우저 버전은 루트에 그대로 두어 Pages 플레이·비교용으로 유지.
- Unity 프로젝트는 PC에서 Unity 에디터로 열어야 한다(폰·클라우드에서는 C# 코드·테스트 작성까지만).
- 큰 바이너리(모델·텍스처·오디오)가 많아지면 Git LFS 사용을 검토(`*.fbx *.png *.wav` 등).
