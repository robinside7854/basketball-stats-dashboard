'use client'
import Image from 'next/image'
import { Users } from 'lucide-react'

// 다이나믹 듀오 — 나와 득점 합작(어시스트→득점)이 가장 많은 조합 BEST 3.
// 서로가 서로에게 얼마씩 기여했는지 방향별로 분해해 보여준다.
//   · 받은 도움 = 파트너 어시스트로 내가 넣은 점수
//   · 준 도움   = 내 어시스트로 파트너가 넣은 점수

export type DuoEntry = {
  partner_id: string
  partner_name: string
  partner_number: number | null
  partner_photo_url: string | null
  total_pts: number
  pts_from_partner: number
  assists_from_partner: number
  pts_to_partner: number
  assists_to_partner: number
}

const RANK_STYLE = [
  { color: '#0a0a0a', bg: '#D4A017' },  // 1위 골드
  { color: '#0a0a0a', bg: '#94A3B8' },  // 2위 실버
  { color: '#ffffff', bg: '#B45309' },  // 3위 브론즈
]

// 테마 반전(라이트/다크)에서도 보이도록 하드코딩 색 대신 토큰 사용
const RECEIVED_COLOR = 'var(--mm-ink)'    // 받은 도움
const GIVEN_COLOR = 'var(--mm-yellow)'    // 준 도움

export default function DynamicDuoPanel({
  duos,
  playerName,
  onSelectPartner,
}: {
  duos: DuoEntry[]
  playerName: string
  onSelectPartner?: (id: string, name: string) => void
}) {
  if (duos.length === 0) {
    return (
      <div className="px-5 py-10 text-center text-sm" style={{ color: 'var(--mm-muted)' }}>
        아직 합작 득점 기록이 없습니다
      </div>
    )
  }

  return (
    <div className="px-5 py-4">
      <p className="text-xs uppercase tracking-[0.20em] font-black mb-1 flex items-center gap-1.5" style={{ color: 'var(--mm-yellow-strong)' }}>
        <Users size={13} aria-hidden />
        다이나믹 듀오
      </p>
      <p className="text-xs mb-3 break-keep" style={{ color: 'var(--mm-muted)' }}>
        어시스트로 함께 만든 득점 합계 상위 3조합
      </p>

      <div className="space-y-2.5">
        {duos.map((d, i) => {
          const rank = RANK_STYLE[i] ?? { color: 'var(--mm-ink)', bg: 'var(--mm-panel-alt)' }
          const total = Math.max(d.total_pts, 1)
          const receivedPct = (d.pts_from_partner / total) * 100
          const givenPct = (d.pts_to_partner / total) * 100
          const clickable = Boolean(onSelectPartner)

          const body = (
            <>
              <div className="flex items-center gap-3">
                <span
                  className="font-jersey font-black tabular-nums w-6 h-6 shrink-0 inline-flex items-center justify-center rounded-full"
                  style={{ color: rank.color, background: rank.bg, fontSize: '13px' }}
                  aria-label={`${i + 1}위`}
                >
                  {i + 1}
                </span>
                {/* 파트너 아바타 */}
                <span
                  className="relative shrink-0 overflow-hidden inline-flex items-center justify-center"
                  style={{ width: 36, height: 45, background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)' }}
                  aria-hidden
                >
                  {d.partner_photo_url ? (
                    <Image src={d.partner_photo_url} alt="" fill sizes="36px" className="object-cover" />
                  ) : (
                    <span className="font-jersey font-black text-sm" style={{ color: 'var(--mm-muted)' }}>
                      {d.partner_name.slice(0, 1)}
                    </span>
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <p
                    className="font-jersey font-black uppercase break-keep"
                    style={{ color: 'var(--mm-ink)', fontSize: '16px', letterSpacing: '-0.005em', lineHeight: 1.2 }}
                  >
                    {d.partner_name}
                  </p>
                  {d.partner_number != null && (
                    <p className="text-xs font-bold uppercase mt-0.5" style={{ color: 'var(--mm-muted)', letterSpacing: '0.10em' }}>
                      #{d.partner_number}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="font-jersey font-black tabular-nums leading-none" style={{ color: 'var(--mm-ink)', fontSize: '28px', letterSpacing: '-0.015em' }}>
                    {d.total_pts}
                  </p>
                  <p className="text-[11px] font-black uppercase mt-1" style={{ color: 'var(--mm-muted)', letterSpacing: '0.14em' }}>합작 득점</p>
                </div>
              </div>

              {/* 방향별 기여 분해 바 */}
              <div className="flex h-2 mt-3 overflow-hidden" style={{ border: '1px solid var(--mm-rule)' }} aria-hidden>
                {receivedPct > 0 && <div style={{ width: `${receivedPct}%`, background: RECEIVED_COLOR }} />}
                {givenPct > 0 && <div style={{ width: `${givenPct}%`, background: GIVEN_COLOR }} />}
              </div>

              <div className="grid grid-cols-2 gap-2 mt-2">
                <div className="px-2.5 py-2" style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', borderLeft: `3px solid ${RECEIVED_COLOR}` }}>
                  <p className="text-[11px] font-bold uppercase truncate" style={{ color: 'var(--mm-muted)', letterSpacing: '0.10em' }}>
                    {d.partner_name} → {playerName}
                  </p>
                  <p className="font-jersey font-black tabular-nums mt-0.5" style={{ color: 'var(--mm-ink)', fontSize: '18px' }}>
                    {d.pts_from_partner}
                    <span className="ml-1 text-xs font-bold" style={{ color: 'var(--mm-muted)' }}>점</span>
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--mm-muted)' }}>어시스트 {d.assists_from_partner}회</p>
                </div>
                <div className="px-2.5 py-2" style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', borderLeft: `3px solid ${GIVEN_COLOR}` }}>
                  <p className="text-[11px] font-bold uppercase truncate" style={{ color: 'var(--mm-muted)', letterSpacing: '0.10em' }}>
                    {playerName} → {d.partner_name}
                  </p>
                  <p className="font-jersey font-black tabular-nums mt-0.5" style={{ color: 'var(--mm-ink)', fontSize: '18px' }}>
                    {d.pts_to_partner}
                    <span className="ml-1 text-xs font-bold" style={{ color: 'var(--mm-muted)' }}>점</span>
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--mm-muted)' }}>어시스트 {d.assists_to_partner}회</p>
                </div>
              </div>
            </>
          )

          const cardStyle: React.CSSProperties = {
            background: 'var(--mm-panel)',
            border: '1px solid var(--mm-rule)',
            borderLeft: `3px solid ${rank.bg}`,
          }

          return clickable ? (
            <button
              key={d.partner_id}
              type="button"
              onClick={() => onSelectPartner?.(d.partner_id, d.partner_name)}
              className="w-full text-left px-3 py-3 cursor-pointer transition-colors duration-200 hover:bg-[color:var(--mm-yellow-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1"
              style={cardStyle}
              title={`${d.partner_name} 카드 보기`}
            >
              {body}
            </button>
          ) : (
            <div key={d.partner_id} className="px-3 py-3" style={cardStyle}>
              {body}
            </div>
          )
        })}
      </div>
    </div>
  )
}
