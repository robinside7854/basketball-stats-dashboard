// 페이지 표시값과 API 결과 비교 — 락다운 김로빈 PTS 검증
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const envText = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
const env = Object.fromEntries(
  envText.split('\n').filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)

// 김로빈 league_id 확인
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const { data: p } = await supabase.from('league_players').select('id, league_id').ilike('name', '%김로빈%').single()
const { data: teams } = await supabase.from('league_teams').select('id, name').eq('league_id', p.league_id)
const playerId = p.id
const leagueId = p.league_id

console.log('🔍 김로빈:', playerId.slice(0, 8))
console.log('🔍 leagueId:', leagueId.slice(0, 8))
console.log('🔍 teams:', teams.map(t => `${t.name}=${t.id.slice(0, 8)}`).join(', '))
console.log()

// Vercel/로컬 API 둘 다 호출 가능. 일단 localhost:3000 또는 vercel URL — 사용자가 보고 있는 페이지의 API 가 무엇인지 알 수 없으므로 직접 stats API 로직을 인라인으로 시뮬레이션
// (Vercel 배포 URL: https://basketball-stats-dashboard.vercel.app)
const BASE = 'https://basketball-stats-dashboard.vercel.app'

for (const t of teams) {
  const url = `${BASE}/api/leagues/${leagueId}/stats?teamId=${t.id}&unit=round`
  try {
    const r = await fetch(url)
    const d = await r.json()
    const me = (d.players ?? []).find(x => x.player_id === playerId)
    console.log(`📊 ${t.name.padEnd(8)} (teamId=${t.id.slice(0, 8)}): ${me ? `R=${me.gp}, PTS=${me.pts}, FG=${me.fgm}/${me.fga}, 3P=${me.fg3m}/${me.fg3a}` : '없음'}`)
  } catch (e) {
    console.log(`❌ ${t.name}: ${e.message}`)
  }
}

// 전체 (no teamId)
console.log()
const totalUrl = `${BASE}/api/leagues/${leagueId}/stats?playerId=${playerId}&unit=round`
try {
  const r = await fetch(totalUrl)
  const d = await r.json()
  const me = (d.players ?? [])[0]
  console.log(`📊 전체 (no teamId)        : ${me ? `R=${me.gp}, PTS=${me.pts}, FG=${me.fgm}/${me.fga}, 3P=${me.fg3m}/${me.fg3a}` : '없음'}`)
} catch (e) {
  console.log(`❌ 전체: ${e.message}`)
}
