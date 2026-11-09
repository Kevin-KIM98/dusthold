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
