// 납작해진 공지 본문(<p>## 제목</p>) 복구 스크립트
//
//   node scripts/repair-announcement-markdown.mjs            # dry-run (변환 결과만 출력)
//   node scripts/repair-announcement-markdown.mjs --commit    # 실제 저장
//   node scripts/repair-announcement-markdown.mjs --id <uuid> # 특정 공지만
//
// src/lib/announcements/markdown.ts 와 동일 로직 (스크립트는 TS 임포트 불가라 복제)
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { marked } from 'marked'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    })
)

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const BLOCK_MD = /^[ \t]{0,3}(#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s|(-{3,}|\*{3,}|_{3,})\s*$|\||```)/m

function markdownToHtml(source) {
  try {
    return marked.parse(source, { async: false, gfm: true, breaks: true })
  } catch {
    return source
  }
}

function repairFlattenedMarkdown(html) {
  const text = html
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
    .replace(/<\/?p[^>]*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  const guarded = text.replace(/\n(-{3,}|\*{3,}|_{3,})[ \t]*(?=\n|$)/g, '\n\n$1\n')
  return markdownToHtml(guarded)
}

const args = process.argv.slice(2)
const commit = args.includes('--commit')
const idIdx = args.indexOf('--id')
const onlyId = idIdx >= 0 ? args[idIdx + 1] : null

let q = supabase.from('league_announcements').select('id, title, body_markdown')
if (onlyId) q = q.eq('id', onlyId)
const { data, error } = await q
if (error) { console.error(error); process.exit(1) }

let fixed = 0
for (const a of data ?? []) {
  const body = a.body_markdown ?? ''
  if (!body.trim()) continue

  // 문단으로 감싸진 상태에서 블록 마크다운이 텍스트로 남아 있는지 검사
  const asText = body.replace(/<\/p>\s*<p[^>]*>/gi, '\n').replace(/<\/?p[^>]*>/gi, '\n').replace(/<br\s*\/?>/gi, '\n')
  const hasBlockTag = /<(h[1-6]|ul|ol|li|blockquote|hr|pre|table)\b/i.test(body)
  if (!BLOCK_MD.test(asText) || hasBlockTag) {
    console.log(`SKIP  ${a.id}  ${a.title}`)
    continue
  }

  const repaired = repairFlattenedMarkdown(body)
  fixed++
  console.log(`\n=== FIX  ${a.id}  ${a.title}`)
  console.log(`--- before (${body.length}자) ---\n${body.slice(0, 300)}`)
  console.log(`--- after  (${repaired.length}자) ---\n${repaired.slice(0, 600)}`)

  if (commit) {
    const { error: uErr } = await supabase
      .from('league_announcements')
      .update({ body_markdown: repaired })
      .eq('id', a.id)
    if (uErr) { console.error('UPDATE FAILED', uErr); process.exit(1) }
    console.log('→ 저장 완료')
  }
}

console.log(`\n대상 ${fixed}건 ${commit ? '저장됨' : '(dry-run · --commit 으로 저장)'}`)
