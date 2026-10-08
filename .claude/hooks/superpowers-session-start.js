// SessionStart hook — superpowers 플러그인의 hooks/session-start 와 같은 역할.
// `.claude/skills/using-superpowers/SKILL.md` 전문을 세션 시작 컨텍스트로 넣는다.
// 플러그인이 아니라 저장소 안 스킬(.claude/skills/)로 설치돼 있어 Node 로 다시 썼다
// (Windows 로컬 · Linux 클라우드 양쪽에서 bash 없이 돈다).
const fs = require('fs');
const path = require('path');

let data = '';
process.stdin.on('data', (c) => (data += c));
process.stdin.on('end', () => {
  try {
    const skillPath = path.join(process.cwd(), '.claude', 'skills', 'using-superpowers', 'SKILL.md');
    const body = fs.readFileSync(skillPath, 'utf8');
    const context =
      '<EXTREMELY_IMPORTANT>\n' +
      'You have superpowers.\n\n' +
      "**Below is the full content of your 'using-superpowers' skill - your introduction to using skills. " +
      "For all other skills, use the 'Skill' tool.**\n\n" +
      'Note: superpowers is installed here as project skills (.claude/skills/), not as a plugin. ' +
      "Where a skill text says `superpowers:<name>` (e.g. `superpowers:brainstorming`), invoke the Skill tool with the bare name `<name>` (e.g. `brainstorming`).\n\n" +
      body +
      '\n</EXTREMELY_IMPORTANT>';
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context },
      }) + '\n'
    );
  } catch (e) {
    // 스킬 파일이 없어도 세션 시작을 막지 않는다.
    process.stderr.write('superpowers-session-start: ' + (e && e.message) + '\n');
  }
  process.exit(0);
});
