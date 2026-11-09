/**
 * 팀 정체성의 분기 목록(["26.1Q","26.2Q","26.4Q"]) → 사람이 읽는 한 줄("1·2·4분기").
 * 해가 둘 이상이면 해마다 묶는다("25년 4분기 · 26년 1·2분기").
 * 2026-11-09 운영진 — 팀 카드에 「26.1Q · 26.2Q …」가 줄줄이 꺾여 어색했다.
 */
export function quarterSpanLabel(labels: string[]): string {
  const byYear = new Map<string, number[]>()
  const unknown: string[] = []
  for (const l of labels) {
    const m = /^(\d{2})\.(\d)Q$/.exec(l)
    if (!m) { if (l) unknown.push(l); continue }
    const list = byYear.get(m[1]) ?? []
    if (!list.includes(Number(m[2]))) list.push(Number(m[2]))
    byYear.set(m[1], list)
  }
  const years = [...byYear.keys()].sort()
  const parts = years.map(y => {
    const qs = joinRuns(byYear.get(y)!.sort((a, b) => a - b))
    return years.length > 1 ? `${y}년 ${qs}분기` : `${qs}분기`
  })
  return [...parts, ...unknown].join(' · ')
}

/** 이어진 분기 3개 이상은 「1~4」, 나머지는 「1·2·4」 */
function joinRuns(nums: number[]): string {
  const out: string[] = []
  for (let i = 0; i < nums.length;) {
    let j = i
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++
    if (j - i >= 2) out.push(`${nums[i]}~${nums[j]}`)
    else for (let k = i; k <= j; k++) out.push(String(nums[k]))
    i = j + 1
  }
  return out.join('·')
}
