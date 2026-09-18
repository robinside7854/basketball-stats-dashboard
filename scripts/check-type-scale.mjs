// 글자 크기·굵기·색 하드코딩 재발 방지 가드 (2026-09-18)
//
//   npm run check:type-scale
//
// 왜 있는가
//   2026-07-03 커밋 416a0d16 이 text-[10px] → text-xs 로 33개 파일을 일괄 치환했다.
//   두 달 뒤 text-[10px] 72건 · text-[11px] 170건이 다시 있었다. 규칙을 문서에만 적고
//   기계가 안 세면, 새 화면을 만들 때마다 같은 관습이 되살아난다.
//
// 무엇을 막는가 (src/app/league + src/components/league)
//   1. text-[Npx] 에서 N < 16   — 라벨 바닥 13.6px(text-xs)·본문 17px 를 우회하는 px 리터럴
//   2. 인라인 fontSize: 'Npx' 에서 N < 16
//   3. 인라인 fontWeight: 900   — 점수판 전용은 font-heavy 유틸을 쓴다(grep 으로 셀 수 있게)
//   4. 하드코딩 회색·빨강 #9ca3af #6b7280 #d1d5db #dc2626 — 라이트에서 2.5~3.5:1 로 미달.
//      --mm-muted / --mm-rule / --mm-negative 토큰을 쓴다.
//
// 큰 px(≥16)·큰 굵기 유틸(font-heavy)·공유 이미지(ShareableBoxscore, social/) 는 대상이 아니다.
// 공유 이미지는 html-to-image 캔버스라 인라인 px 가 불가피하고, 운영자가 이번 범위에서 뺐다.

import fs from 'node:fs'
import path from 'node:path'

const ROOTS = ['src/app/league', 'src/components/league']
const EXCLUDE = [
  'src/components/league/ShareableBoxscore.tsx',
  'src/components/league/social/',
]

const RULES = [
  { name: 'text-[Npx] (N<16)', re: /text-\[(\d+(?:\.\d+)?)px\]/g, bad: m => Number(m[1]) < 16 },
  { name: "fontSize: 'Npx' (N<16)", re: /fontSize:\s*'(\d+(?:\.\d+)?)px'/g, bad: m => Number(m[1]) < 16 },
  { name: 'fontWeight: 900', re: /fontWeight:\s*'?900'?/g, bad: () => true },
  { name: '하드코딩 회색·빨강', re: /#(9ca3af|6b7280|d1d5db|dc2626)\b/gi, bad: () => true },
]

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) yield* walk(p)
    else if (/\.tsx?$/.test(e.name)) yield p
  }
}

const hits = []
let scanned = 0
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const rel = file.split(path.sep).join('/')
    if (EXCLUDE.some(x => rel.startsWith(x))) continue
    scanned++
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/)
    lines.forEach((line, i) => {
      for (const rule of RULES) {
        for (const m of line.matchAll(rule.re)) {
          if (rule.bad(m)) hits.push({ rule: rule.name, file: rel, line: i + 1, text: m[0] })
        }
      }
    })
  }
}

// "합계 0" 이 "아무것도 안 봤다" 가 되지 않게 — 몇 파일을 봤는지 먼저 찍는다.
console.log(`검사한 파일: ${scanned}개`)
if (scanned < 50) {
  console.error('⚠ 검사 파일 수가 비정상적으로 적다 — 경로가 틀렸을 수 있다. 통과로 치지 않는다.')
  process.exitCode = 1
}

if (hits.length === 0) {
  console.log('✓ 통과 — px 리터럴(<16)·인라인 900·하드코딩 회색 0건')
} else {
  const byRule = {}
  for (const h of hits) (byRule[h.rule] ||= []).push(h)
  for (const [rule, list] of Object.entries(byRule)) {
    console.error(`\n✗ ${rule}: ${list.length}건`)
    for (const h of list.slice(0, 15)) console.error(`  ${h.file}:${h.line}  ${h.text}`)
    if (list.length > 15) console.error(`  … 외 ${list.length - 15}건`)
  }
  console.error(`\n총 ${hits.length}건. 대체: text-xs / t-label / t-td / font-heavy / var(--mm-*)`)
  process.exitCode = 1
}
