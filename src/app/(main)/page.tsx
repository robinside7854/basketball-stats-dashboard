import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/admin'
import { Basketball } from '@/components/league/BasketballIcons'

// 온볼 진입 화면.
//
// 온볼은 플랫폼이고 동호회는 그 안에 입점한 고객이다. 설치형 앱(PWA)의 start_url 이
// 여기이므로, 앱을 열면 이 화면에서 자기 동호회로 들어간다.
//
// 예전엔 이 자리에 파란날개 청년부/장년부 2분할 랜딩이 하드코딩돼 있었다 —
// 특정 동호회가 플랫폼의 첫 화면을 차지하고 있던 셈이라 DB 기반 목록으로 교체했다.
export const dynamic = 'force-dynamic'

type Row = {
  org_slug: string
  team_name: string
  league_slug: string | null
  season_year: number | null
}

async function loadClubs(): Promise<Row[]> {
  const sb = createClient()
  const { data } = await sb
    .from('orgs')
    .select('slug, name, status, teams(name, leagues(slug, name, season_year))')
    .eq('status', 'active')
    .order('name')

  const rows: Row[] = []
  for (const o of (data ?? []) as unknown as Array<{
    slug: string; name: string
    teams: Array<{ name: string; leagues: Array<{ slug: string; name: string; season_year: number }> }>
  }>) {
    for (const t of o.teams ?? []) {
      // 팀에 시즌이 여러 개면 최신 연도 하나만 노출 — 진입 화면은 "지금 보는 곳"만 보여준다
      const latest = [...(t.leagues ?? [])].sort((a, b) => b.season_year - a.season_year)[0]
      rows.push({
        org_slug: o.slug,
        team_name: t.name,
        league_slug: latest?.slug ?? null,
        season_year: latest?.season_year ?? null,
      })
    }
  }
  return rows
}

export default async function OnBallEntry() {
  const clubs = await loadClubs()
  // 시즌이 아직 없는 팀은 들어갈 곳이 없으므로 목록에서 뺀다
  const active = clubs.filter(c => c.league_slug)

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-5 py-16" style={{ background: 'var(--mm-ground)' }}>
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2.5 mb-1">
          <Basketball size={26} />
          <span
            className="font-jersey font-black uppercase"
            style={{ color: 'var(--mm-ink)', fontSize: 30, letterSpacing: '0.14em' }}
          >
            OnBall
          </span>
        </div>
        <p className="text-sm mb-8" style={{ color: 'var(--mm-muted)' }}>
          공이 온 순간, 기록이 남는다
        </p>

        {active.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--mm-muted)' }}>
            아직 등록된 동호회가 없습니다.
          </p>
        ) : (
          <>
            <p
              className="text-[11px] font-black uppercase mb-2"
              style={{ color: 'var(--mm-muted)', letterSpacing: '0.16em' }}
            >
              동호회 선택
            </p>
            <ul className="space-y-2">
              {active.map(c => (
                <li key={`${c.org_slug}/${c.league_slug}`}>
                  <Link
                    href={`/league/${c.org_slug}/${c.league_slug}`}
                    className="flex items-center gap-3 px-4 py-3.5 min-h-[56px] cursor-pointer transition-colors duration-200 hover:bg-[color:var(--mm-yellow-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)]"
                    style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)' }}
                  >
                    <div className="flex-1 min-w-0">
                      <p
                        className="font-jersey font-black uppercase break-keep"
                        style={{ color: 'var(--mm-ink)', fontSize: 17, letterSpacing: '-0.005em', lineHeight: 1.2 }}
                      >
                        {c.team_name}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--mm-muted)' }}>
                        {c.season_year} 시즌
                      </p>
                    </div>
                    <ArrowRight size={16} style={{ color: 'var(--mm-muted)' }} aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
