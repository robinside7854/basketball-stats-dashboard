// 쓰는 법: 시험 화면(src/app/zzshot/…, 커밋 금지)을 띄운 뒤 node text-wrap-audit.example.js guide|aguide
//   guide = 회원 가이드, aguide = 어드민 가이드(시험 응답의 role 을 admin 으로)
const { chromium } = require('playwright')
const { route } = require(process.argv[2] === 'aguide' ? './mocks-admin' : './mocks')
;(async () => {
  const b = await chromium.launch()
  for (const w of [360, 390, 768, 1024, 1280, 1440]) {
    const p = await b.newPage({ viewport: { width: w, height: 900 } })
    await p.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(route(r.request().url()) ?? { ok: true }) }))
    await p.goto('http://localhost:3100/zzshot/league/miracle/demo/' + (process.argv[2] || 'guide'), { waitUntil: 'networkidle', timeout: 120000 })
    await p.waitForTimeout(800)
    const bad = await p.evaluate(() => {
      const root = document.querySelector('nav[aria-label="가이드 목차"]').parentElement
      const out = []
      const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      let n
      while ((n = tw.nextNode())) {
        const t = n.textContent; const re = /\S+/g; let m
        while ((m = re.exec(t))) {
          const r = document.createRange(); r.setStart(n, m.index); r.setEnd(n, m.index + m[0].length)
          const tops = new Set([...r.getClientRects()].filter(x => x.width > 0).map(x => Math.round(x.top)))
          if (tops.size > 1) out.push(m[0])
        }
      }
      const multi = []
      for (const el of root.querySelectorAll('li > span:last-child, li > p > span:last-child, li div > p')) {
        const r = document.createRange(); r.selectNodeContents(el)
        const tops = new Set([...r.getClientRects()].filter(x => x.width > 0).map(x => Math.round(x.top)))
        if (tops.size > 1) multi.push(el.textContent.trim())
      }
      return { out, multi }
    })
    console.log(w, bad.out.length ? '단어꺾임: ' + bad.out.join(' | ') : '단어꺾임 0', '· 두 줄 문장 ' + bad.multi.length + (bad.multi.length ? ': ' + bad.multi.join(' / ') : ''))
    if (w === 1280) await p.screenshot({ path: `${__dirname}/wrap-${process.argv[2]}-${w}.png`, fullPage: true })
    await p.close()
  }
  await b.close()
})()
