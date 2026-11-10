// 명단 붙여 넣기 읽기 (2026-11-10 4단계 마법사) — 화면 미리보기와 서버 저장이 같은 규칙을 쓴다.
//   한 줄 = 한 사람. 「이름 · 포지션 · 생년월일 6자리」를 탭·쉼표·띄어쓰기로 나눈다(뒤 두 칸은 없어도 된다).
//   엑셀에서 열을 그대로 복사해 붙여 넣는 것을 생각했다.
export interface RosterLine { name: string; position: string | null; birth6: string | null }

const POS = new Set(['G', 'F', 'C', 'PG', 'SG', 'SF', 'PF'])

export function parseRosterPaste(text: string): { rows: RosterLine[]; problems: string[] } {
  const rows: RosterLine[] = []
  const problems: string[] = []
  const seen = new Set<string>()
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.normalize('NFC').trim()
    if (!line) return
    // 탭·쉼표가 있으면 그것으로 나누고, 없으면 띄어쓰기 — 뒤쪽 칸 중 포지션·6자리 숫자만 떼고 남은 앞쪽이 이름
    const tokens = /[\t,]/.test(line) ? line.split(/[\t,]+/) : line.split(/\s+/)
    const parts = tokens.map(s => s.trim()).filter(Boolean)
    let position: string | null = null
    let birth6: string | null = null
    while (parts.length > 1) {
      const last = parts[parts.length - 1]
      const ps = last.toUpperCase().split(/[\/·]/)
      if (/^\d{6}$/.test(last) && !birth6) birth6 = last
      else if (!position && ps.every(x => POS.has(x))) position = ps.join(',')
      else break
      parts.pop()
    }
    const name = parts.join(' ')
    if (!name || name.length > 20) { problems.push(`${i + 1}번째 줄 — 이름을 읽지 못했어요`); return }
    const key = name.replace(/\s+/g, '')
    if (seen.has(key)) { problems.push(`${i + 1}번째 줄 — ${name} 이름이 두 번 있어요`); return }
    seen.add(key)
    rows.push({ name, position, birth6 })
  })
  return { rows, problems }
}
