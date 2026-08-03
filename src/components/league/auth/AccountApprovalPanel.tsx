'use client'
// 어드민 · 회원 가입 요청 승인 큐 + 계정 관리
//   · pending: 승인/반려 · approved: 비번 초기화/비활성화
//   · 리그 PIN 필요 (leagueHeaders 로 전달)
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { UserPlus, Check, X, RotateCcw, Ban, User as UserIcon, RefreshCw, ShieldCheck, ShieldOff } from 'lucide-react'

type Status = 'pending' | 'approved' | 'rejected' | 'disabled'

interface AccountRow {
  id: string
  league_player_id: string
  login_id: string
  status: Status
  // 편집 권한 — admin 이면 로그인만으로 편집 모드가 켜진다 (PIN 과 동일 권한)
  role: 'member' | 'admin'
  requested_at: string
  approved_at: string | null
  last_login_at: string | null
  reset_by_admin_at: string | null
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

// 상태 뱃지 색 — bg/fg 쌍으로 정의해 라이트/다크 양쪽에서 대비 확보 (2026-07-26 수정).
//  · pending: 밝은 옐로(양 테마 밝음) + 검정 텍스트 → 항상 가독. (기존 yellow-strong 은 라이트에서 어두워져 검정과 4:1 marginal)
//  · disabled: 고정 그레이 + 흰 텍스트. (기존 --mm-muted 배경은 다크에서 밝아져 흰 텍스트가 소실됐음)
//  · approved/rejected: 고정 채도색 + 흰 텍스트 → 양 테마 안전.
const STATUS_COLOR: Record<Status, { bg: string; fg: string }> = {
  pending:  { bg: 'var(--mm-yellow)', fg: 'var(--mm-black)' },
  approved: { bg: '#059669', fg: '#fff' },
  rejected: { bg: '#DC2626', fg: '#fff' },
  disabled: { bg: '#6B7280', fg: '#fff' },
}

export default function AccountApprovalPanel({ leagueId, leagueHeaders }: Props) {
  const [rows, setRows] = useState<AccountRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'pending' | 'all'>('pending')
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/leagues/${leagueId}/auth/admin/accounts?status=${filter}`, {
        headers: leagueHeaders,
        cache: 'no-store',
      })
      const d = await r.json()
      if (!r.ok) { toast.error(d.error ?? '로드 실패'); return }
      setRows(d.accounts ?? [])
    } finally { setLoading(false) }
  }, [leagueId, leagueHeaders, filter])

  useEffect(() => { load() }, [load])

  async function act(
    id: string,
    action: 'approve' | 'reject' | 'disable' | 'reset_password' | 'set_role',
    role?: 'member' | 'admin',
  ) {
    if (busyId) return
    setBusyId(id)
    try {
      const r = await fetch(`/api/leagues/${leagueId}/auth/admin/accounts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...leagueHeaders },
        body: JSON.stringify(action === 'set_role' ? { action, role } : { action }),
      })
      const d = await r.json()
      if (!r.ok) { toast.error(d.error ?? '실패'); return }
      if (action === 'reset_password') toast.success(d.reset_password_note ?? '비번 초기화 완료')
      else if (action === 'approve') toast.success('승인 완료')
      else if (action === 'reject') toast.info('반려 처리')
      else if (action === 'set_role') toast.success(role === 'admin' ? '어드민 지정 완료' : '어드민 해제')
      else toast.info('비활성화 처리')
      await load()
    } finally { setBusyId(null) }
  }

  const pendingCount = rows.filter(r => r.status === 'pending').length

  return (
    <section
      className="mm-brand"
      style={{
        background: 'var(--mm-panel)',
        border: '1px solid var(--mm-rule)',
        borderRadius: '6px',
        overflow: 'hidden',
      }}
    >
      <header
        className="flex items-center justify-between gap-3 px-4 py-3.5"
        style={{ borderBottom: '1px solid var(--mm-rule)' }}
      >
        <div className="flex items-center gap-2.5">
          <UserPlus size={18} style={{ color: 'var(--mm-yellow-strong)' }} />
          <h3 className="font-jersey font-black uppercase text-lg" style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}>
            회원 가입 · 계정 관리
          </h3>
          {filter === 'pending' && pendingCount > 0 && (
            <span
              className="inline-flex items-center px-1.5 py-0.5 text-[11px] font-black tracking-[0.14em]"
              style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', borderRadius: '3px' }}
            >
              대기 {pendingCount}건
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setFilter('pending')}
            className="px-2.5 py-1.5 text-xs font-black uppercase min-h-[36px] cursor-pointer"
            style={{
              background: filter === 'pending' ? 'var(--mm-black)' : 'var(--mm-panel-alt)',
              color: filter === 'pending' ? 'var(--mm-yellow)' : 'var(--mm-ink-soft)',
              border: `1px solid ${filter === 'pending' ? 'var(--mm-black)' : 'var(--mm-rule)'}`,
              borderRadius: '3px',
              letterSpacing: '0.10em',
            }}
          >대기</button>
          <button
            onClick={() => setFilter('all')}
            className="px-2.5 py-1.5 text-xs font-black uppercase min-h-[36px] cursor-pointer"
            style={{
              background: filter === 'all' ? 'var(--mm-black)' : 'var(--mm-panel-alt)',
              color: filter === 'all' ? 'var(--mm-yellow)' : 'var(--mm-ink-soft)',
              border: `1px solid ${filter === 'all' ? 'var(--mm-black)' : 'var(--mm-rule)'}`,
              borderRadius: '3px',
              letterSpacing: '0.10em',
            }}
          >전체</button>
          <button
            onClick={load}
            aria-label="새로고침"
            className="p-1.5 min-h-[36px] min-w-[36px] cursor-pointer rounded"
            style={{ color: 'var(--mm-muted)' }}
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </header>

      {loading ? (
        <div className="py-8 text-center text-xs font-bold uppercase" style={{ color: 'var(--mm-muted)', letterSpacing: '0.14em' }}>
          로딩중…
        </div>
      ) : rows.length === 0 ? (
        <div className="py-10 text-center text-[13px]" style={{ color: 'var(--mm-muted)' }}>
          {filter === 'pending' ? '승인 대기 중인 요청이 없습니다' : '계정 없음'}
        </div>
      ) : (
        <ul className="divide-y divide-[color:var(--mm-rule)]">
          {rows.map(r => (
            <li key={r.id} className="flex items-center gap-3 p-3">
              {/* 프로필 */}
              <div
                className="relative w-10 h-10 shrink-0 rounded-full overflow-hidden flex items-center justify-center"
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
              {/* 이름 · 정보 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm truncate" style={{ color: 'var(--mm-ink)' }}>
                    {r.player?.number != null ? `#${r.player.number} ` : ''}{r.player?.name ?? '(선수 정보 없음)'}
                  </span>
                  <span
                    className="inline-flex items-center text-[10px] font-black uppercase tracking-[0.12em] px-1.5 py-0.5"
                    style={{
                      background: STATUS_COLOR[r.status].bg,
                      color: STATUS_COLOR[r.status].fg,
                      borderRadius: '2px',
                    }}
                  >
                    {STATUS_LABEL[r.status]}
                  </span>
                  {r.role === 'admin' && (
                    <span
                      className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.12em] px-1.5 py-0.5"
                      style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', borderRadius: '2px' }}
                      title="편집 권한 보유 — 로그인만으로 편집 모드가 켜집니다"
                    >
                      <ShieldCheck size={10} aria-hidden />어드민
                    </span>
                  )}
                </div>
                <div className="text-[11px] mt-1" style={{ color: 'var(--mm-muted)' }}>
                  아이디: <b style={{ color: 'var(--mm-ink-soft)' }}>{r.login_id}</b>
                  {' · 요청: '}
                  {new Date(r.requested_at).toLocaleDateString('ko-KR')}
                  {r.last_login_at && ` · 최근로그인: ${new Date(r.last_login_at).toLocaleDateString('ko-KR')}`}
                </div>
              </div>
              {/* 액션 */}
              <div className="flex items-center gap-1 shrink-0">
                {r.status === 'pending' && (
                  <>
                    <button
                      onClick={() => act(r.id, 'approve')}
                      disabled={busyId === r.id}
                      className="inline-flex items-center gap-1 text-xs font-black uppercase px-2.5 py-1.5 min-h-[36px] cursor-pointer"
                      style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: '3px', letterSpacing: '0.10em', opacity: busyId === r.id ? 0.5 : 1 }}
                    >
                      <Check size={12} />
                      승인
                    </button>
                    <button
                      onClick={() => act(r.id, 'reject')}
                      disabled={busyId === r.id}
                      className="inline-flex items-center gap-1 text-xs font-black uppercase px-2.5 py-1.5 min-h-[36px] cursor-pointer"
                      style={{ background: 'var(--mm-panel-alt)', color: '#DC2626', border: '1px solid #DC2626', borderRadius: '3px', letterSpacing: '0.10em', opacity: busyId === r.id ? 0.5 : 1 }}
                    >
                      <X size={12} />
                      반려
                    </button>
                  </>
                )}
                {r.status === 'approved' && (
                  <>
                    <button
                      onClick={() => act(r.id, 'set_role', r.role === 'admin' ? 'member' : 'admin')}
                      disabled={busyId === r.id}
                      title={r.role === 'admin' ? '편집 권한 회수' : '편집 권한 부여 (PIN 과 동일)'}
                      className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1.5 min-h-[36px] cursor-pointer"
                      style={{
                        background: r.role === 'admin' ? 'var(--mm-panel-alt)' : 'var(--mm-yellow)',
                        color: r.role === 'admin' ? 'var(--mm-muted)' : 'var(--mm-black)',
                        border: `1px solid ${r.role === 'admin' ? 'var(--mm-rule)' : 'var(--mm-yellow)'}`,
                        borderRadius: '3px',
                        opacity: busyId === r.id ? 0.5 : 1,
                      }}
                    >
                      {r.role === 'admin' ? <ShieldOff size={12} /> : <ShieldCheck size={12} />}
                      {r.role === 'admin' ? '어드민 해제' : '어드민 지정'}
                    </button>
                    <button
                      onClick={() => act(r.id, 'reset_password')}
                      disabled={busyId === r.id}
                      title="비번을 '123456' 으로 초기화"
                      className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1.5 min-h-[36px] cursor-pointer"
                      style={{ background: 'var(--mm-panel-alt)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)', borderRadius: '3px', opacity: busyId === r.id ? 0.5 : 1 }}
                    >
                      <RotateCcw size={12} />
                      비번 초기화
                    </button>
                    <button
                      onClick={() => act(r.id, 'disable')}
                      disabled={busyId === r.id}
                      className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1.5 min-h-[36px] cursor-pointer"
                      style={{ background: 'var(--mm-panel-alt)', color: 'var(--mm-muted)', border: '1px solid var(--mm-rule)', borderRadius: '3px', opacity: busyId === r.id ? 0.5 : 1 }}
                    >
                      <Ban size={12} />
                      비활성화
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
