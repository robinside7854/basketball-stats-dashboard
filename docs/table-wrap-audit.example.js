const { chromium } = require('playwright'); const fs = require('fs')
const S = '/tmp/claude-0/-home-user/46b9874f-5a66-5eb8-9d33-9e3cfc224f6a/scratchpad'
const J = f => fs.readFileSync(`${S}/${f}`, 'utf8')
// 분기표: 굵은 칸(리그 최고)을 일부러 넓게 — 사용자 화면처럼
const q = JSON.parse(J('pc/qrows.json')); q.quarter_rows.forEach((r, i) => { r.best = i < 2 ? ['gp', 'fg3_pct', 'ppg'] : []; r.values.fg3_pct = 28.3; r.values.fg_pct = 31.9 })
q.quarter_total = { avg: { ...q.quarter_rows[0], best: ['fg_pct', 'fg3_pct', 'ppg'] }, sums: { gp: 35, pts: 733, reb: 204, ast: 204, stl: 51, blk: 4, fgm: 245, fga: 795, fg3m: 191, fg3a: 668 } }
const QR = JSON.stringify(q)
const ME = JSON.stringify({ authenticated: true, user: { id: 'u', login_id: 'x', player_id: 'p8', name: '이현욱', number: 9, position: 'G', photo_url: null, is_default_password: false, role: 'member' }, ceo: false })
function route(u) {
  if (u.includes('/auth/me')) return ME
  if (u.includes('quarterRows=only')) return QR
  if (u.includes('/detail')) return J('pc/detail.json')
  if (u.includes('/career')) return '{"leagues":[],"league_career":{},"tournaments":[]}'
  if (u.includes('team-identities')) return J('tm/ti.json')
  if (u.includes('head-to-head')) return J('tm/h2h.json')
  if (u.includes('/insights')) return J('tm/ins.json')
  if (u.includes('team-insights')) return J('tm/tins.json')
  if (u.includes('daily-boxscore')) return J('bx/box.json')
  if (u.includes('/stats')) return J('lb/stats.json')
  return 'null'
}
const AUDIT = () => {
  const out = []
  for (const cell of document.querySelectorAll('table td, table th')) {
    const cs = getComputedStyle(cell); if (cs.display === 'none' || cs.visibility === 'hidden') continue
    const b = cell.getBoundingClientRect(); if (!b.width) continue
    const txt = (cell.textContent || '').trim().replace(/\s+/g, ' ')
    if (cell.scrollWidth > cell.clientWidth + 1) out.push(`넘침[${txt.slice(0, 20)}] ${cell.scrollWidth}>${cell.clientWidth}`)
    // 값 한가운데 꺾임: 띄어쓰기 없는 글 덩어리가 두 줄 이상
    const w = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT)
    let n; while ((n = w.nextNode())) {
      const t = n.textContent; if (!t || !t.trim()) continue
      const pe = n.parentElement; if (pe && (getComputedStyle(pe).display === 'none')) continue
      const r = document.createRange(); r.selectNodeContents(n)
      const tops = new Set([...r.getClientRects()].filter(x => x.width > 0).map(x => Math.round(x.top)))
      if (tops.size > 1 && !/[\s·/]/.test(t.trim())) out.push(`꺾임[${t.trim().slice(0, 20)}]`)
    }
  }
  // 이웃 텍스트 노드가 같은 단어인데 줄이 갈린 경우(예: 28.3 + <span>%</span>)
  for (const cell of document.querySelectorAll('table td')) {
    const parts = []; const w = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT); let n
    while ((n = w.nextNode())) { if (!n.textContent.trim()) continue; const pe = n.parentElement; if (pe && getComputedStyle(pe).display === 'none') continue; const r = document.createRange(); r.selectNodeContents(n); const rc = [...r.getClientRects()].filter(x => x.width > 0); if (rc.length) parts.push({ t: n.textContent, top: Math.round(rc[0].top), lastTop: Math.round(rc[rc.length - 1].top) }) }
    for (let i = 1; i < parts.length; i++) {
      const a = parts[i - 1], c = parts[i]
      if (!/\s$/.test(a.t) && !/^\s/.test(c.t) && /[0-9.]$/.test(a.t.trim()) && /^[%점개]/.test(c.t.trim()) && c.top > a.lastTop) out.push(`꺾임[${a.t.trim()}|${c.t.trim()}]`)
    }
  }
  return [...new Set(out)]
}
const pages = [
  ['선수카드', 'preview-pc', async p => { for (const [tab, view] of [['기록', '일별'], ['기록', '월별'], ['기록', '분기별']]) { await p.getByRole('tab', { name: tab }).or(p.getByRole('button', { name: tab, exact: true })).first().click().catch(() => {}); await p.waitForTimeout(500); await p.getByRole('button', { name: view, exact: true }).click().catch(() => {}); await p.waitForTimeout(900); p.__res.push([view, await p.evaluate(AUDIT)]) } }],
  ['팀', 'preview-tm/m/L1', async p => { p.__res.push(['기본', await p.evaluate(AUDIT)]); for (const v of ['누적', '슈팅', '고급']) { await p.getByRole('button', { name: v, exact: true }).first().click().catch(() => {}); await p.waitForTimeout(700); p.__res.push([v, await p.evaluate(AUDIT)]) } }],
  ['리더보드', 'preview-stats/m/L1', async p => { p.__res.push(['하루평균', await p.evaluate(AUDIT)]); await p.getByRole('button', { name: '누적', exact: true }).first().click().catch(() => {}); await p.waitForTimeout(800); p.__res.push(['누적', await p.evaluate(AUDIT)]); await p.getByRole('button', { name: /고급 지표/ }).first().click().catch(() => {}); await p.waitForTimeout(800); p.__res.push(['고급', await p.evaluate(AUDIT)]) }],
  ['박스스코어', 'preview-bx/m/L1', async p => { await p.evaluate(() => document.querySelectorAll('details').forEach(d => d.open = true)); await p.waitForTimeout(500); await p.locator('ol.grid li button').first().click().catch(() => {}); await p.waitForTimeout(800); p.__res.push(['경기결과+펼침', await p.evaluate(AUDIT)]); await p.getByRole('tab', { name: /선수 기록/ }).or(p.getByRole('button', { name: /선수 기록/ })).first().click().catch(() => {}); await p.waitForTimeout(900); p.__res.push(['선수기록', await p.evaluate(AUDIT)]) }],
]
;(async () => {
  const b = await chromium.launch(); let bad = 0
  for (const W of (process.argv[2] || '360,390,768,1024,1280,1440').split(',').map(Number)) {
    for (const [name, path, act] of pages) {
      const p = await b.newPage({ viewport: { width: W, height: 900 } }); p.__res = []
      await p.route('**/api/**', r => r.fulfill({ contentType: 'application/json', body: route(r.request().url()) }))
      await p.goto(`http://localhost:3123/${path}`, { waitUntil: 'networkidle', timeout: 120000 }); await p.waitForTimeout(2000)
      await act(p)
      for (const [v, issues] of p.__res) if (issues.length) { bad += issues.length; console.log(W, name, v, issues.slice(0, 8).join(' | ')) }
      await p.close()
    }
  }
  console.log('문제 수', bad); await b.close()
})()
