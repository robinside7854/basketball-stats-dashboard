// 지난 날짜의 YouTube 영상을 다시 연동한다 — 화면의 "YouTube 연동" 버튼과 **같은 코드**로.
//
//   npx tsx scripts/youtube-resync.ts <leagueId> <YYYY-MM-DD>        # 드라이런(기본, 저장 안 함)
//   npx tsx scripts/youtube-resync.ts <leagueId> <YYYY-MM-DD> apply  # 실제 저장
//
// 왜 스크립트로 두는가
//   수동 버튼은 로그인 + 리그 PIN 이 있어야 눌린다. 제목 규칙이 바뀌어 옛 날짜를 다시 붙여야 할 때
//   (업로더가 팀 표기를 바꾸는 일이 반복된다) 터미널에서 드라이런으로 먼저 확인할 통로가 필요하다.
//
// ⚠ 매핑 로직을 여기에 베껴 쓰지 말 것. 베끼는 순간 화면과 스크립트가 갈라져,
//   "스크립트로는 붙는데 버튼으로는 안 붙는" 상태를 진단할 수 없게 된다.

import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { syncYoutubeForLeague } from '../src/lib/youtube/syncYoutubeForLeague'

function loadEnv(): Record<string, string> {
  const file = path.join(process.cwd(), '.env.local')
  const out: Record<string, string> = {}
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const eq = line.indexOf('=')
    if (eq > 0 && /^\w/.test(line)) out[line.slice(0, eq)] = line.slice(eq + 1).trim()
  }
  return out
}

async function main() {
  const [leagueId, date, mode] = process.argv.slice(2)
  if (!leagueId || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) {
    console.error('usage: npx tsx scripts/youtube-resync.ts <leagueId> <YYYY-MM-DD> [apply]')
    process.exit(1)
  }
  const dryRun = mode !== 'apply'
  const env = loadEnv()

  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  const { data: league } = await sb
    .from('leagues')
    .select('name, youtube_channel')
    .eq('id', leagueId)
    .maybeSingle()
  if (!league?.youtube_channel) {
    console.error('이 리그에 youtube_channel 이 없습니다 — 설정 탭에서 먼저 지정하세요')
    process.exit(1)
  }

  const out = await syncYoutubeForLeague(sb, leagueId, league.youtube_channel, date, env.YOUTUBE_API_KEY, { dryRun })

  console.log(`\n=== ${league.name} · ${date} · ${dryRun ? 'DRY RUN (저장 안 함)' : 'APPLY'} ===`)
  if (!out.ok) {
    console.log('연동 실패:', out.reason)
    if (out.foundTitles) for (const t of out.foundTitles) console.log('  검색된 제목:', t)
    process.exit(2)
  }

  console.log(`영상 ${out.totalVideos}개 · 연동 ${out.mapped}개 · 모드 ${out.mode}`)
  for (const d of out.details) {
    console.log(`  [${d.action}] slot=${d.slotNum ?? '-'} q=${d.quarter ?? '-'} ${d.title}`)
  }
  if (out.skipped > 0) {
    console.log(`\n⚠ 못 붙인 영상 ${out.skipped}개`)
    for (const r of out.skippedReasons) console.log('   -', r)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
