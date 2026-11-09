'use client'
// 어드민 · 회원 가입 요청 승인 + 계정 관리
//   2026-11-09 운영진 정리(세로 길이 줄이기):
//   · 가입 신청은 맨 위에 따로 — 승인/반려
//   · 회원 목록은 늘 「최근 접속 순」. 줄마다 가입일 · 최근 접속 · 비밀번호를 바꿨는지(초기 비밀번호면 표시)
//   · 아이디 줄은 뺐다 — 아이디가 실명이라 이름과 같은 말이 두 번 나왔다
//   · 어드민 지정은 줄마다 붙이지 않고 머리의 「어드민 지정」 버튼 하나로(거의 안 쓰는 일)
//   · 처음엔 10명만, 나머지는 「더 보기」 · PC 는 두 칸
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { UserPlus, Check, X, RotateCcw, Ban, User as UserIcon, RefreshCw, Search, ShieldCheck, KeyRound } from 'lucide-react'

type Status = 'pending' | 'approved' | 'rejected' | 'disabled'

interface AccountRow {
  id: string
  league_player_id: string
  login_id: string
  status: Status
  // 편집 권한 — admin 이면 로그인만으로 편집 모드가 켜진다
  role: 'member' | 'admin'
  requested_at: string
  approved_at: string | null
  last_login_at: string | null
  /** 마지막으로 앱을 연 시각(6시간 단위 기록) */
  last_seen_at?: string | null
  reset_by_admin_at: string | null
  /** 회원이 직접 비밀번호를 바꾼 시각 — 없으면 가입 때 생년월일 6자리(초기화 후면 123456) 그대로 */
  password_changed_at?: string | null
  player: {
    id: string
    name: string
    number: number | null
    photo_url: string | null
  } | null
}

interface Props {
  leagueId: string
  leagueHeaders: Record<string, string>
}

const STATUS_LABEL: Record<Status, string> = {
  pending: '승인 대기',
  approved: '승인됨',
  rejected: '반려',
  disabled: '비활성',
}
const STATUS_COLOR: Record<Status, { bg: string; fg: string }> = {
  pending:  { bg: 'var(--mm-yellow)', fg: 'var(--mm-black)' },
  approved: { bg: '#059669', fg: '#fff' },
  rejected: { bg: '#C4362B', fg: '#fff' },
  disabled: { bg: '#57534E', fg: '#fff' },
}

const FIRST_SHOWN = 10
const DAY = 24 * 60 * 60 * 1000

function lastSeenOf(r: AccountRow): number | null {
  const t = Math.max(r.last_seen_at ? Date.parse(r.last_seen_at) : 0, r.last_login_at ? Date.parse(r.last_login_at) : 0)
  return t > 0 ? t : null
}

function shortDate(t: number): string {
  const d = new Date(t)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return sameYear ? `${d.getMonth() + 1}.${d.getDate()}` : `${String(d.getFullYear()).slice(2)}.${d.getMonth() + 1}.${d.getDate()}`
}

// 최근 접속 — 일주일 안은 「오늘 · 어제 · N일 전」, 그 뒤는 날짜
function seenLabel(t: number | null): string {
  if (t == null) return '접속 기록 없음'
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0)
  const days = Math.floor((startOfToday.getTime() - new Date(t).setHours(0, 0, 0, 0)) / DAY)
  if (days <= 0) return '오늘 접속'
  if (days === 1) return '어제 접속'
  if (days < 7) return `${days}일 전 접속`
  return `${shortDate(t)} 접속`
}

function nameOf(r: AccountRow) {
  return `${r.player?.number != null ? `#${r.player.number} ` : ''}${r.player?.name ?? '(선수 정보 없음)'}`
}

function Avatar({ r }: { r: AccountRow }) {
  return (
    <div
      className="w-9 h-9 shrink-0 rounded-full overflow-hidden flex items-center justify-center"
      style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)' }}
      aria-hidden
    >
      {r.player?.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={r.player.photo_url} alt="" className="w-full h-full object-cover" />
      ) : (
        <UserIcon size={18} style={{ color: 'var(--mm-muted)' }} />
      )}
    </div>
  )
}

const ICON_BTN = 'inline-flex items-center justify-center min-h-11 min-w-11 cursor-pointer transition-colors duration-200 hover:bg-[color:var(--mm-panel-alt)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[color:var(--mm-ink)] disabled:opacity-50'

export default function AccountApprovalPanel({ leagueId, leagueHeaders }: Props) {
  const [rows, setRows] = useState<AccountRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)
  const [adminQuery, setAdminQuery] = useState('')

  // 늘 전체를 받는다 — 가입 신청·회원 목록·어드민 지정이 같은 목록을 나눠 쓴다
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/leagues/${leagueId}/auth/admin/accounts?status=all`, {
        headers: leagueHeaders,
        cache: 'no-store',
      })
      const d = await r.json()
      if (!r.ok) { toast.error(d.error ?? '불러오지 못했어요'); return }
      setRows(d.accounts ?? [])
    } finally { setLoading(false) }
  }, [leagueId, leagueHeaders])

  useEffect(() => { load() }, [load])

  async function act(
    r: AccountRow,
    action: 'approve' | 'reject' | 'disable' | 'reset_password' | 'set_role',
    role?: 'member' | 'admin',
  ) {
    if (busyId) return
    const name = r.player?.name ?? '이 회원'
    if (action === 'reset_password' && !window.confirm(`${name}의 비밀번호를 「123456」으로 되돌릴까요?`)) return
    if (action === 'disable' && !window.confirm(`${name} 계정을 비활성화할까요? 다시 로그인할 수 없게 돼요.`)) return
    if (action === 'set_role' && role === 'admin' && !window.confirm(`${name}에게 어드민 권한을 줄까요? 기록·명단·설정을 모두 고칠 수 있게 돼요.`)) return
    if (action === 'set_role' && role === 'member' && !window.confirm(`${name}의 어드민 권한을 거둘까요?`)) return
    setBusyId(r.id)
    try {
      const res = await fetch(`/api/leagues/${leagueId}/auth/admin/accounts/${r.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...leagueHeaders },
        body: JSON.stringify(action === 'set_role' ? { action, role } : { action }),
      })
      const d = await res.json()
      if (!res.ok) { toast.error(d.error ?? '실패'); return }
      if (action === 'reset_password') toast.success(d.reset_password_note ?? '비밀번호를 초기화했어요')
      else if (action === 'approve') toast.success('승인했어요')
      else if (action === 'reject') toast.info('반려했어요')
      else if (action === 'set_role') toast.success(role === 'admin' ? '어드민으로 지정했어요' : '어드민에서 뺐어요')
      else toast.info('비활성화했어요')
      await load()
    } finally { setBusyId(null) }
  }

  const pending = useMemo(
    () => rows.filter(r => r.status === 'pending').sort((a, b) => Date.parse(b.requested_at) - Date.parse(a.requested_at)),
    [rows],
  )
  // 회원 목록 — 승인 회원 먼저, 그 안에서 최근 접속 순(접속 기록 없는 사람은 뒤, 가입 늦은 순)
  const members = useMemo(() => {
    const rank = (s: Status) => (s === 'approved' ? 0 : 1)
    return rows.filter(r => r.status !== 'pending').sort((a, b) =>
      rank(a.status) - rank(b.status)
      || (lastSeenOf(b) ?? 0) - (lastSeenOf(a) ?? 0)
      || Date.parse(b.requested_at) - Date.parse(a.requested_at))
  }, [rows])
  const approved = members.filter(r => r.status === 'approved')
  const activeWeek = approved.filter(r => (lastSeenOf(r) ?? 0) >= Date.now() - 7 * DAY).length
  const defaultPw = approved.filter(r => !r.password_changed_at).length
  const admins = approved.filter(r => r.role === 'admin')

  const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase()
  const matches = (r: AccountRow, q: string) =>
    norm(r.player?.name ?? '').includes(q) || norm(r.login_id).includes(q) || (r.player?.number != null && String(r.player.number) === q)
  const q = norm(query)
  const filtered = q ? members.filter(r => matches(r, q)) : members
  const shown = q || showAll ? filtered : filtered.slice(0, FIRST_SHOWN)
  const aq = norm(adminQuery)
  const adminCandidates = aq ? approved.filter(r => r.role !== 'admin' && matches(r, aq)).slice(0, 6) : []

  return (
    <section
      className="mm-brand"
      style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', borderRadius: '6px', overflow: 'hidden' }}
    >
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3" style={{ borderBottom: '1px solid var(--mm-rule)' }}>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <UserPlus size={18} style={{ color: 'var(--mm-yellow-strong)' }} aria-hidden />
            <h3 className="font-black text-lg whitespace-nowrap" style={{ color: 'var(--mm-ink)' }}>회원</h3>
          </div>
          {approved.length > 0 && (
            <p className="text-xs font-bold mt-0.5" style={{ color: 'var(--mm-ink-soft)' }}>
              승인 {approved.length}명 · 최근 7일 접속 <b style={{ color: 'var(--mm-ink)' }}>{activeWeek}명</b>
              {defaultPw > 0 && <> · 초기 비밀번호 {defaultPw}명</>}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setAdminOpen(o => !o)}
            aria-expanded={adminOpen}
            className="inline-flex items-center gap-1 px-3 min-h-11 text-xs font-black whitespace-nowrap cursor-pointer transition-colors duration-200"
            style={{
              background: adminOpen ? 'var(--mm-black)' : 'var(--mm-panel-alt)',
              color: adminOpen ? 'var(--mm-yellow)' : 'var(--mm-ink-soft)',
              border: `1px solid ${adminOpen ? 'var(--mm-black)' : 'var(--mm-rule)'}`,
              borderRadius: '3px',
            }}
          >
            <ShieldCheck size={14} aria-hidden />어드민 지정
          </button>
          <button type="button" onClick={load} aria-label="새로고침" className={`${ICON_BTN} rounded`} style={{ color: 'var(--mm-muted)' }}>
            <RefreshCw size={14} />
          </button>
        </div>
      </header>

      {/* 어드민 지정 — 펼쳤을 때만. 지금 어드민 + 이름으로 찾아 지정 */}
      {adminOpen && (
        <div className="px-4 py-3 space-y-2" style={{ background: 'var(--mm-panel-alt)', borderBottom: '1px solid var(--mm-rule)' }}>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="t-label mr-1">지금 어드민</span>
            {admins.length === 0 && <span className="text-xs" style={{ color: 'var(--mm-muted)' }}>없음</span>}
            {admins.map(r => (
              <span key={r.id} className="inline-flex items-center gap-1 pl-2 text-xs font-black" style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', borderRadius: '3px' }}>
                {r.player?.name ?? '(이름 없음)'}
                <button
                  type="button"
                  onClick={() => act(r, 'set_role', 'member')}
                  disabled={busyId === r.id}
                  aria-label={`${r.player?.name ?? ''} 어드민 해제`}
                  title="어드민 해제"
                  className="inline-flex items-center justify-center min-h-9 min-w-9 cursor-pointer disabled:opacity-50"
                >
                  <X size={14} />
                </button>
              </span>
            ))}
          </div>
          <label className="relative block">
            <span className="sr-only">어드민으로 지정할 회원 찾기</span>
            <Search size={16} aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--mm-muted)' }} />
            <input
              type="search"
              value={adminQuery}
              onChange={e => setAdminQuery(e.target.value)}
              placeholder="지정할 회원 이름으로 찾기"
              className="w-full min-h-11 pl-9 pr-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)]"
              style={{ background: 'var(--mm-panel)', color: 'var(--mm-ink)', border: '1px solid var(--mm-rule)', borderRadius: '3px' }}
            />
          </label>
          {aq && (adminCandidates.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--mm-muted)' }}>맞는 승인 회원이 없어요</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {adminCandidates.map(r => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => act(r, 'set_role', 'admin')}
                    disabled={busyId === r.id}
                    className="inline-flex items-center gap-1 px-3 min-h-11 text-sm font-bold cursor-pointer disabled:opacity-50"
                    style={{ background: 'var(--mm-panel)', color: 'var(--mm-ink)', border: '1px solid var(--mm-rule)', borderRadius: '3px' }}
                  >
                    <ShieldCheck size={14} aria-hidden />{nameOf(r)} 지정
                  </button>
                </li>
              ))}
            </ul>
          ))}
        </div>
      )}

      {/* 가입 신청 — 있을 때만, 맨 위 */}
      {pending.length > 0 && (
        <div style={{ borderBottom: '1px solid var(--mm-rule)' }}>
          <p className="px-4 pt-3 pb-1 text-xs font-black" style={{ color: 'var(--mm-ink)' }}>
            가입 신청 <span className="inline-flex items-center px-1.5 py-0.5 ml-1" style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', borderRadius: '3px' }}>{pending.length}건</span>
          </p>
          <ul className="divide-y divide-[color:var(--mm-rule)]">
            {pending.map(r => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-2">
                <Avatar r={r} />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm" style={{ color: 'var(--mm-ink)' }}>{nameOf(r)}</div>
                  <div className="text-xs" style={{ color: 'var(--mm-muted)' }}>{shortDate(Date.parse(r.requested_at))} 신청</div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => act(r, 'approve')}
                    disabled={busyId === r.id}
                    className="inline-flex items-center gap-1 text-xs font-black px-3 min-h-11 cursor-pointer disabled:opacity-50"
                    style={{ background: '#059669', color: '#fff', borderRadius: '3px' }}
                  >
                    <Check size={14} aria-hidden />승인
                  </button>
                  <button
                    type="button"
                    onClick={() => act(r, 'reject')}
                    disabled={busyId === r.id}
                    className="inline-flex items-center gap-1 text-xs font-black px-3 min-h-11 cursor-pointer disabled:opacity-50"
                    style={{ background: 'var(--mm-panel-alt)', color: 'var(--mm-negative)', border: '1px solid var(--mm-negative)', borderRadius: '3px' }}
                  >
                    <X size={14} aria-hidden />반려
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 회원 목록 */}
      <div className="px-3 pt-3 pb-2">
        <label className="relative block">
          <span className="sr-only">회원 이름 · 등번호로 찾기</span>
          <Search size={16} aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--mm-muted)' }} />
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="이름 · 등번호로 찾기"
            className="w-full min-h-11 pl-9 pr-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)]"
            style={{ background: 'var(--mm-panel-alt)', color: 'var(--mm-ink)', border: '1px solid var(--mm-rule)', borderRadius: '3px' }}
          />
        </label>
      </div>

      {loading ? (
        <div className="py-8 text-center text-xs font-bold" style={{ color: 'var(--mm-muted)' }}>불러오는 중</div>
      ) : shown.length === 0 ? (
        <div className="py-8 text-center text-sm" style={{ color: 'var(--mm-muted)' }}>{q ? '맞는 회원이 없어요' : '아직 회원이 없어요'}</div>
      ) : (
        <ul className="grid sm:grid-cols-2 gap-px" style={{ background: 'var(--mm-rule)', borderTop: '1px solid var(--mm-rule)' }}>
          {shown.map(r => {
            const isApproved = r.status === 'approved'
            return (
              <li key={r.id} className="flex items-center gap-2.5 pl-3 pr-1 py-1.5" style={{ background: 'var(--mm-panel)', opacity: isApproved ? 1 : 0.7 }}>
                <Avatar r={r} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-sm" style={{ color: 'var(--mm-ink)' }}>{nameOf(r)}</span>
                    {r.role === 'admin' && isApproved && (
                      <span className="inline-flex items-center gap-0.5 text-[11px] font-black px-1 py-px" style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', borderRadius: '2px' }}>
                        <ShieldCheck size={12} aria-hidden />어드민
                      </span>
                    )}
                    {!isApproved && (
                      <span className="inline-flex items-center text-[11px] font-black px-1 py-px" style={{ background: STATUS_COLOR[r.status].bg, color: STATUS_COLOR[r.status].fg, borderRadius: '2px' }}>
                        {STATUS_LABEL[r.status]}
                      </span>
                    )}
                    {isApproved && !r.password_changed_at && (
                      <span
                        className="inline-flex items-center gap-0.5 text-[11px] font-bold px-1 py-px"
                        style={{ color: 'var(--mm-ink-soft)', border: '1px dashed var(--mm-ink-soft)', borderRadius: '2px' }}
                        title="아직 비밀번호를 바꾸지 않았어요 — 가입 때 넣은 생년월일 6자리(초기화했다면 123456) 그대로예요"
                      >
                        <KeyRound size={12} aria-hidden />초기 비밀번호
                      </span>
                    )}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--mm-muted)' }}>
                    {shortDate(Date.parse(r.requested_at))} 가입 · {seenLabel(lastSeenOf(r))}
                  </div>
                </div>
                {isApproved && (
                  <div className="flex items-center shrink-0" style={{ color: 'var(--mm-muted)' }}>
                    <button
                      type="button"
                      onClick={() => act(r, 'reset_password')}
                      disabled={busyId === r.id}
                      aria-label={`${r.player?.name ?? ''} 비밀번호 초기화`}
                      title="비밀번호를 123456 으로 초기화"
                      className={ICON_BTN}
                    >
                      <RotateCcw size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => act(r, 'disable')}
                      disabled={busyId === r.id}
                      aria-label={`${r.player?.name ?? ''} 비활성화`}
                      title="비활성화"
                      className={ICON_BTN}
                    >
                      <Ban size={16} />
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {!q && !loading && filtered.length > FIRST_SHOWN && (
        <button
          type="button"
          onClick={() => setShowAll(v => !v)}
          className="w-full min-h-11 text-sm font-bold cursor-pointer transition-colors duration-200 hover:bg-[color:var(--mm-panel-alt)]"
          style={{ color: 'var(--mm-ink-soft)', borderTop: '1px solid var(--mm-rule)' }}
        >
          {showAll ? '접기' : `${filtered.length - FIRST_SHOWN}명 더 보기`}
        </button>
      )}
      {!loading && approved.length > 0 && (
        <p className="px-4 py-2 text-xs" style={{ color: 'var(--mm-muted)', borderTop: '1px solid var(--mm-rule)' }}>
          <RotateCcw size={12} className="inline -mt-0.5" aria-hidden /> 비밀번호 초기화(123456) · <Ban size={12} className="inline -mt-0.5" aria-hidden /> 비활성화
        </p>
      )}
    </section>
  )
}
