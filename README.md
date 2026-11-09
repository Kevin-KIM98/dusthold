# LASTGATE (가칭)

뿔양 탄 성주로 은화를 모아 기지를 키우고, 몰려오는 약탈단과 거인을 막는 디펜스 게임.
브라우저 프로토타입으로 먼저 만들고, 이후 Unity로 옮긴다.

**바로 하기 (폰·PC):** https://kevin-kim98.github.io/dusthold/ (M1: 성주 이동·맵까지)

- 기획서: [design/plan.md](design/plan.md) — 승인됨 (2026-11-09)
- 진행 로그: [design/progress.md](design/progress.md)
- Unity 이식 계획: [design/unity-port.md](design/unity-port.md)
- Claude Code 작업 지침: [CLAUDE.md](CLAUDE.md)
- 이전 게임 DUSTHOLD: `archive-dusthold` 브랜치에 보관

## Claude Code에서 쓰는 법

1. claude.ai의 Claude Code(폰·웹) 또는 PC에서 `dusthold` 저장소를 선택해 새 세션을 연다.
2. 첫 메시지 예시:

```
CLAUDE.md와 design/plan.md를 읽어줘.
기획서 승인할게. M1(뼈대)부터 시작해서, 완료 기준을 테스트로 확인하고
progress.md 적고 커밋한 뒤 결과만 쉽게 보고해줘.
```

3. 다음부터는 짧게:
   - `M2 진행해줘`
   - `적 웨이브 간격 좀 늘려줘` → `data/balance.json`만 바뀜
   - `완료 기준 전부 테스트해줘`
   - `기획서에 OO 추가해줘, 그다음 코드 반영해줘`

## 로컬 실행 (PC)

```
python3 -m http.server 8000   # 브라우저로 localhost:8000
npm test                      # 로직 테스트
```
