'use client'
// 홈 최상단 — 다음 경기 참여신청.
//
// 왜 맨 위인가: 이 카드는 **매주 전원이 한 번씩 눌러야** 값이 생긴다. 탭 안이나 스크롤 아래에
//   두면 아무도 안 누르고, 그러면 총무는 결국 단톡방을 병행하게 된다. 그 순간 앱 명단은
//   틀린 채 남는다. 다른 카드와 달리 이건 '보는 것'이 아니라 '하는 것'이라 맨 위에 있어야 한다.
//
// 왜 서버가 아니라 클라이언트에서 받아오는가: 홈은 unstable_cache 로 통째로 캐시된다.
//   내 응답은 사람마다 다르므로 그 캐시에 섞이면 남의 응답이 보인다. 캐시 밖에서 따로 받는다.
//   대신 로딩 중에도 카드 높이를 유지해 화면이 튀지 않게 한다.
//
// 비로그인에게도 경기 정보는 보여준다 — 가입해야 신청할 수 있다는 걸 알리는 게
//   가입 독려의 실질이다. 빈자리로 두면 이런 게 있는 줄도 모른다.
import { useEffect, useState } from 'react'
import { CalendarDays, Clock, MapPin, Check, X, HelpCircle, Loader2, Users, LogIn } from 'lucide-react'
import { toast } from 'sonner'

type Status = 'going' | 'not_going' | 'maybe'

interface Member { name: string; status: Status }
interface TeamGroup { teamId: string; teamName: string; members: Member[] }

interface Payload {
  date: { id: string; date: string; start_time: string | null; place: string | null; capacity: number | null } | null
  me: { status: Status | null; teamName: string | null; waiting: boolean } | null
  summary: { going: number; maybe: number; not_going: number } | null
  /** 회원 전용 — 비로그인에게는 null(숫자만 준다). */
  teams: { list: TeamGroup[]; waiting: Member[] } | null
}

const CHOICES: Array<{ value: Status; label: string; Icon: typeof Check }> = [
  { value: 'going', label: '참석', Icon: Check },
  { value: 'maybe', label: '미정', Icon: HelpCircle },
  { value: 'not_going', label: '불참', Icon: X },
]

function formatDate(d: string): string {
  const dt = new Date(d + 'T00:00:00')
  const days = ['일', '월', '화', '수', '목', '금', '토']
  return `${dt.getMonth() + 1}월 ${dt.getDate()}일 (${days[dt.getDay()]})`
}

/** 며칠 남았는지. 오늘·내일은 숫자보다 말이 빨리 읽힌다. */
function relativeLabel(d: string): string | null {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const target = new Date(d + 'T00:00:00')
  const days = Math.round((target.getTime() - today.getTime()) / 86400000)
  if (days <= 0) return '오늘'
  if (days === 1) return '내일'
  if (days <= 7) return `${days}일 뒤`
  return null
}

export default function NextGameRsvp({ leagueId }: { leagueId: string }) {
  const [data, setData] = useState<Payload | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState<Status | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/leagues/${leagueId}/rsvp`)
      .then(r => (r.ok ? r.json() : null))
      .then((d: Payload | null) => { if (!cancelled) { setData(d); setLoaded(true) } })
      .catch(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [leagueId])

  async function choose(status: Status) {
    if (!data?.date) return
    setSaving(status)
    const res = await fetch(`/api/leagues/${leagueId}/rsvp`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: data.date.date, status }),
    })
    setSaving(null)
    if (res.ok) {
      // 서버를 다시 부른다 — 배정 팀과 인원수가 함께 바뀌기 때문에 로컬로 흉내 내면 어긋난다.
      const fresh = await fetch(`/api/leagues/${leagueId}/rsvp`).then(r => (r.ok ? r.json() : null))
      if (fresh) setData(fresh)
      toast.success(status === 'going' ? '참석으로 등록했습니다' : status === 'maybe' ? '미정으로 등록했습니다' : '불참으로 등록했습니다')
    } else {
      const d = await res.json().catch(() => ({}))
      toast.error(d.error ?? '저장하지 못했습니다')
    }
  }

  // 로딩 중에는 같은 높이의 자리만 잡아 둔다 — 카드가 뒤늦게 끼어들면 아래 내용이 밀린다.
  if (!loaded) {
    return <div className="min-h-[92px]" aria-hidden style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-card)' }} />
  }
  // 예정 일정이 아예 없으면(전부 대관 없음이거나 일정 미등록) 카드를 그리지 않는다.
  if (!data?.date) return null

  const { date, me, summary, teams } = data
  const rel = relativeLabel(date.date)
  const isMember = me !== null

  return (
    <section
      className="px-4 py-3.5 md:px-5 md:py-4"
      style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-card)' }}
      aria-label="다음 경기 참여신청"
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: 'var(--mm-yellow-strong)' }}>
            다음 경기{rel ? ` · ${rel}` : ''}
          </p>
          <p className="mt-0.5 font-bold break-keep" style={{ color: 'var(--mm-ink)', fontSize: 'clamp(17px, 4.4vw, 20px)', lineHeight: 1.2 }}>
            <CalendarDays size={17} className="inline-block mr-1.5 -mt-0.5" aria-hidden style={{ color: 'var(--mm-yellow-strong)' }} />
            {formatDate(date.date)}
          </p>
          {(date.start_time || date.place) && (
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px]" style={{ color: 'var(--mm-ink-soft)' }}>
              {date.start_time && (
                <span className="inline-flex items-center gap-1"><Clock size={13} aria-hidden style={{ color: 'var(--mm-muted)' }} />{date.start_time.slice(0, 5)}</span>
              )}
              {date.place && (
                <span className="inline-flex items-center gap-1 min-w-0"><MapPin size={13} aria-hidden className="shrink-0" style={{ color: 'var(--mm-muted)' }} /><span className="break-keep">{date.place}</span></span>
              )}
            </div>
          )}
        </div>

        {summary && (
          <div className="shrink-0 text-right">
            <p className="inline-flex items-center gap-1 text-[12px] font-bold" style={{ color: 'var(--mm-ink-soft)' }}>
              <Users size={13} aria-hidden style={{ color: 'var(--mm-muted)' }} />
              참석 <span className="tabular-nums" style={{ color: 'var(--mm-ink)' }}>{summary.going}</span>
              {date.capacity ? <span style={{ color: 'var(--mm-muted)' }}>/{date.capacity}</span> : null}명
            </p>
            {summary.maybe > 0 && (
              <p className="text-[11px]" style={{ color: 'var(--mm-muted)' }}>미정 {summary.maybe}명</p>
            )}
          </div>
        )}
      </div>

      {isMember ? (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {CHOICES.map(({ value, label, Icon }) => {
              const active = me?.status === value
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => choose(value)}
                  disabled={saving !== null}
                  aria-pressed={active}
                  className="inline-flex items-center justify-center gap-1.5 min-h-[44px] text-[12px] font-black tracking-[0.08em] uppercase cursor-pointer transition-colors disabled:opacity-50"
                  style={{
                    background: active ? 'var(--mm-ink)' : 'var(--mm-panel)',
                    color: active ? 'var(--mm-panel)' : 'var(--mm-ink-soft)',
                    border: `1px solid ${active ? 'var(--mm-ink)' : 'var(--mm-rule)'}`,
                    borderRadius: 'var(--mm-radius-ctl)',
                    transitionDuration: 'var(--mm-motion-fast)',
                  }}
                >
                  {saving === value ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Icon size={13} aria-hidden />}
                  {label}
                </button>
              )
            })}
          </div>

          {/* 배정 결과 — 참석일 때만 말한다. 불참인데 팀 이름이 뜨면 나가는 줄 안다. */}
          {me?.status === 'going' && (
            <p className="mt-2 text-[12px]" style={{ color: me.waiting ? 'var(--mm-muted)' : 'var(--mm-ink-soft)' }}>
              {me.waiting
                ? '배정 대기 — 운영진 회의에서 팀이 정해집니다'
                : me.teamName ? <>배정 팀 · <b style={{ color: 'var(--mm-ink)' }}>{me.teamName}</b></> : null}
            </p>
          )}

          {/* 팀별 참가 현황 — 숫자만 보면 "우리 팀은 몇 명 오나"를 알 수 없다.
              대기(비정규)는 팀 목록에 섞지 않는다. 섞으면 팀 인원이 실제보다 많아 보이고,
              운영진이 누굴 배치해야 하는지 못 찾는다. */}
          {teams && (teams.list.length > 0 || teams.waiting.length > 0) && (
            <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--mm-rule)' }}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {teams.list.map(t => (
                  <div key={t.teamId} className="px-3 py-2" style={{ background: 'var(--mm-panel-alt)', borderRadius: 'var(--mm-radius-chip)' }}>
                    <p className="flex items-baseline gap-1.5 text-[12px] font-black" style={{ color: 'var(--mm-ink)' }}>
                      <span className="truncate">{t.teamName}</span>
                      <span className="tabular-nums shrink-0" style={{ color: 'var(--mm-yellow-strong)' }}>
                        {t.members.filter(m => m.status === 'going').length}명
                      </span>
                    </p>
                    <p className="mt-0.5 text-[12px] leading-relaxed break-keep" style={{ color: 'var(--mm-ink-soft)' }}>
                      {t.members.map((m, i) => (
                        <span key={m.name + i} style={{ opacity: m.status === 'maybe' ? 0.55 : 1 }}>
                          {i > 0 && ', '}{m.name}{m.status === 'maybe' ? '(미정)' : ''}
                        </span>
                      ))}
                    </p>
                  </div>
                ))}
              </div>

              {teams.waiting.length > 0 && (
                <div className="mt-2 px-3 py-2" style={{ border: '1px dashed var(--mm-rule)', borderRadius: 'var(--mm-radius-chip)' }}>
                  <p className="flex items-baseline gap-1.5 text-[12px] font-black" style={{ color: 'var(--mm-muted)' }}>
                    배정 대기
                    <span className="tabular-nums">{teams.waiting.filter(m => m.status === 'going').length}명</span>
                  </p>
                  <p className="mt-0.5 text-[12px] leading-relaxed break-keep" style={{ color: 'var(--mm-ink-soft)' }}>
                    {teams.waiting.map((m, i) => (
                      <span key={m.name + i} style={{ opacity: m.status === 'maybe' ? 0.55 : 1 }}>
                        {i > 0 && ', '}{m.name}{m.status === 'maybe' ? '(미정)' : ''}
                      </span>
                    ))}
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        // 로그인은 라우트가 아니라 모달이다 — LeagueLayoutClient 가 이 이벤트를 받아 연다.
        // 여기서 임의의 /login 경로로 보내면 404 가 난다.
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('mm-open-login'))}
          className="mt-3 w-full flex items-center justify-center gap-1.5 min-h-[44px] text-[12px] font-black tracking-[0.08em] uppercase cursor-pointer transition-colors"
          style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', borderRadius: 'var(--mm-radius-ctl)' }}
        >
          <LogIn size={14} aria-hidden />
          로그인하고 참여신청
        </button>
      )}
    </section>
  )
}
