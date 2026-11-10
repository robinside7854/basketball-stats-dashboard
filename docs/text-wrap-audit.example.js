const { chromium } = require('playwright')
const { route } = require('./mocks')
;(async () => {
  const b = await chromium.launch()
  for (const w of [360, 390, 768, 1024, 1280, 1440]) {
    const p = await b.newPage({ viewport: { width: w, height: 900 } })
    await p.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(route(r.request().url()) ?? { ok: true }) }))
    await p.goto('http://localhost:3100/zzshot/league/miracle/demo/guide', { waitUntil: 'networkidle', timeout: 120000 })
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
      return out
    })
    console.log(w, bad.length ? '꺾임: ' + bad.join(' | ') : '꺾임 0')
    if (w === 1280) await p.screenshot({ path: `${__dirname}/guide-${w}.png`, fullPage: true })
    await p.close()
  }
  await b.close()
})()
