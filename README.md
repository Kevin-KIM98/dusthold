# DUSTHOLD (가칭)

지상은 탐험, 지하는 건설. 밤마다 좀비가 방폭문을 두드리는 브라우저 생존 경영 게임.

- 기획서: [design/plan.md](design/plan.md)
- 진행 로그: [design/progress.md](design/progress.md)
- Claude Code 작업 지침: [CLAUDE.md](CLAUDE.md)

---

## Claude Code에서 시작하는 법

### 1. 저장소 만들기
GitHub에서 새 저장소 `dusthold`를 만들고, 이 폴더의 파일(`CLAUDE.md`, `README.md`, `design/`)을 그대로 올립니다.
(PC라면 이 폴더에서 `git init` 후 push해도 됩니다.)

### 2. Claude Code 열기
- 폰/웹: claude.ai의 Claude Code에서 `dusthold` 저장소 선택
- PC: 이 폴더에서 `claude` 실행

### 3. 첫 메시지로 붙여넣기

```
CLAUDE.md와 design/plan.md를 먼저 읽어줘.
기획서대로 M1(뼈대)부터 시작해줘.
M1 완료 기준을 테스트로 확인하고, 다 통과하면 progress.md 적고 커밋한 뒤
나한테 결과만 쉽게 보고하고 M2 진행할지 물어봐.
```

### 4. 다음 단계부터
- 다음 마일스톤: `M2 진행해줘` 처럼 짧게
- 수치 조정: `습격 좀비 수 좀 줄여줘` → config.js만 바뀜
- 검수: `완료 기준 전부 테스트해줘` (self-check 스킬이 있으면 그걸로)
- 폰으로 해보기: `GitHub Pages로 배포해줘`

### 5. 기획 바꾸고 싶을 때
`design/plan.md`를 먼저 고치라고 하세요. 예: `기획서에 의무실 빼고 그 자리에 오락실 추가해줘, 그다음 코드 반영해줘`
