import { createClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, Layers } from 'lucide-react'
import type { League } from '@/types/league'
import { isLeaguePublic, getApprovedSession } from '@/lib/auth/guard'
import { segmentLabel, type LeagueMode } from '@/lib/league/mode'
import { Basketball } from '@/components/league/BasketballIcons'

// leagues.mode 는 아직 types/league.ts 의 League 인터페이스에 없다(083 이후 컬럼) —
// 여기서만 필요한 최소 확장. 세그먼트 호칭('대회'/'분기')을 카드에 보여주려면 있어야 한다.
type LeagueRow = League & { mode: LeagueMode }

const statusLabel: Record<string, string> = {
  active: '진행 중',
  upcoming: '시작 예정',
  completed: '종료',
}

// org 아래 leagueId 없이 들어온 주소 — /league/paranalgae 처럼 소속 팀이 둘 이상이면
// 자동으로 하나를 고르지 않고 선택 화면을 보여준다 (단계 C-5).
//   파란날개 청년부·장년부는 서로 다른 팀이라, active/upcoming 중 하나를 임의로 골라
//   보내면 방문자 절반은 자기 팀이 아닌 화면을 보게 된다.
export default async function LeagueIndexPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const supabase = createClient()

  // ⚠ org_slug 로만 걸러야 한다 — 여기서 필터가 풀리면 다른 동호회의 리그까지 섞여
  // "다른 동호회가 존재한다"는 사실 자체가 새어 나간다(플랫폼 핵심 규칙).
  const { data: leagues } = await supabase
    .from('leagues')
    .select('*')
    .eq('org_slug', orgSlug)
    .in('status', ['active', 'upcoming'])
    .order('created_at', { ascending: false })

  const rows = (leagues as LeagueRow[] | null) ?? []

  // 같은 org 안에서도 팀 단위 공개/비공개(teams.is_public)는 별개로 지켜야 한다.
  // 비공개 리그는 그 리그에 이미 승인된 세션(쿠키의 lid 가 정확히 이 leagueId 와 일치)을
  // 들고 있는 방문자에게만 보여준다 — 다른 리그의 승인 세션으로는 존재조차 알 수 없다.
  const visible = (
    await Promise.all(
      rows.map(async l => (
        (await isLeaguePublic(l.id)) || (await getApprovedSession(l.id)) ? l : null
      )),
    )
  ).filter((l): l is LeagueRow => l !== null)

  // 고를 게 하나뿐이면 선택 화면 없이 곧장 보낸다 (기존 자동 이동 동작 유지)
  if (visible.length === 1) {
    redirect(`/league/${orgSlug}/${visible[0].id}`)
  }

  if (visible.length === 0) {
    return (
      <main
        className="min-h-screen flex flex-col items-center justify-center px-6 py-16"
        style={{ background: 'var(--mm-ground)' }}
      >
        <div className="w-full max-w-md text-center">
          <BrandMark />
          <div
            className="mt-8 px-5 py-10 sm:px-8"
            style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', borderRadius: '6px' }}
          >
            <span
              className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-4"
              style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)' }}
              aria-hidden
            >
              <Layers size={24} style={{ color: 'var(--mm-muted)' }} />
            </span>
            <h1
              className="font-jersey font-black uppercase text-xl mb-2"
              style={{ color: 'var(--mm-ink)' }}
            >
              준비 중인 팀이 없어요
            </h1>
            <p className="text-[14px] leading-relaxed break-keep" style={{ color: 'var(--mm-ink-soft)' }}>
              현재 이 주소로 볼 수 있는 팀 페이지가 없어요.
              <br />
              전달받은 링크를 다시 확인해 주세요.
            </p>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main
      className="min-h-screen flex flex-col items-center px-4 py-12 sm:px-6 sm:py-16"
      style={{ background: 'var(--mm-ground)' }}
    >
      <div className="w-full max-w-md">
        <div className="text-center">
          <BrandMark />
        </div>

        <div className="mt-8 text-center">
          <h1
            className="font-jersey font-black uppercase text-xl sm:text-2xl mb-2"
            style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}
          >
            어느 팀을 보시겠어요?
          </h1>
          <p className="text-[14px] leading-relaxed break-keep" style={{ color: 'var(--mm-ink-soft)' }}>
            같은 주소 아래 팀이 여러 개예요.
            <br />
            보고 싶은 팀을 골라 주세요.
          </p>
        </div>

        <ul className="mt-7 space-y-3">
          {visible.map(league => (
            <li key={league.id}>
              <Link
                href={`/league/${orgSlug}/${league.id}`}
                className="flex items-center gap-3 px-5 py-4 min-h-[44px] rounded-md cursor-pointer transition-all duration-200 hover:brightness-95 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-black)]"
                style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)' }}
              >
                <span
                  className="shrink-0 inline-flex items-center justify-center w-11 h-11 rounded-full"
                  style={{ background: 'var(--mm-yellow-soft)', border: '1px solid var(--mm-rule)' }}
                  aria-hidden
                >
                  <Basketball size={20} />
                </span>

                <span className="flex-1 min-w-0 text-left">
                  <span className="flex items-center gap-2 flex-wrap">
                    <span
                      className="font-jersey font-black uppercase text-[15px] sm:text-base truncate"
                      style={{ color: 'var(--mm-ink)' }}
                    >
                      {league.name}
                    </span>
                    <span
                      className="text-[11px] px-2 py-0.5 rounded-full font-medium shrink-0"
                      style={{ background: 'var(--mm-panel-alt)', color: 'var(--mm-muted)' }}
                    >
                      {statusLabel[league.status] ?? league.status}
                    </span>
                  </span>
                  <span className="block text-[12px] mt-0.5" style={{ color: 'var(--mm-muted)' }}>
                    {league.season_year}시즌 · {segmentLabel(league.mode)}
                  </span>
                </span>

                <ChevronRight size={18} className="shrink-0" style={{ color: 'var(--mm-muted)' }} aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  )
}

function BrandMark() {
  return (
    <div className="flex items-center justify-center gap-2">
      <Basketball size={26} />
      <span
        className="font-jersey font-black uppercase"
        style={{ color: 'var(--mm-ink)', fontSize: 26, letterSpacing: '0.14em' }}
      >
        OnBall
      </span>
    </div>
  )
}
