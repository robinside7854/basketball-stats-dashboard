# superpowers 스킬 (vendored)

이 폴더의 다음 15개 스킬은 https://github.com/obra/superpowers 의 `skills/` 를 **그대로 복사**한 것이다:

brainstorming · diagnosing-superpowers · dispatching-parallel-agents · executing-plans ·
finishing-a-development-branch · receiving-code-review · requesting-code-review ·
subagent-driven-development · systematic-debugging · test-driven-development ·
using-git-worktrees · using-superpowers · verification-before-completion · writing-plans · writing-skills

- 복사한 upstream 커밋: `8ca22dba9a94f28898bbce59f2537ff4d87c747d` (v6.4.2, 2026-09-25)
- 왜 플러그인 설치가 아니라 복사인가: Claude Code **클라우드 세션은 저장소 `.claude/settings.json` 의
  `enabledPlugins` / `extraKnownMarketplaces` 를 설치하지 않는다**(신뢰 대화상자를 거칠 수 없기 때문).
  저장소 안 `.claude/skills/` 는 로컬·클라우드 모두에서 항상 읽힌다.
- 세션 시작 안내문(`using-superpowers`)은 `.claude/hooks/superpowers-session-start.js` 가 넣는다
  (upstream 플러그인의 SessionStart 훅과 같은 역할).
- **업데이트**: `node scripts/update-superpowers.mjs` 를 실행하면 upstream 최신 `skills/` 로 다시 덮어쓴다.
- ⚠ 이 폴더의 스킬 파일은 손으로 고치지 말 것 — 업데이트 때 덮어써진다.
  스킬 본문에 적힌 `superpowers:brainstorming` 같은 이름은 여기서는 접두어 없이 `brainstorming` 으로 부른다.
