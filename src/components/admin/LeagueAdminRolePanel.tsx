'use client'
// 어드민 대시보드 · 리그 회원 편집 권한(어드민 role) 관리
//   · 승인된 회원에게 어드민 권한을 주면 그 사람은 로그인만으로 편집 모드가 켜진다
//     (기존 리그 편집 PIN 과 동일한 권한).
//   · 인가는 NextAuth 어드민 세션 — /api/admin/leagues/[leagueId]/accounts 사용.
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, ShieldCheck, ShieldOff, RefreshCw, User as UserIcon } from 'lucide-react'

type Status = 'pending' | 'approved' | 'rejected' | 'disabled'

interface AccountRow {
  id: string
  league_player_id: string
  login_id: string
  status: Status
  role: 'member' | 'admin'
  last_login_at: string | null
  player: { id: string; name: string; number: number | null; photo_url: string | null } | null
}

const STATUS_LABEL: Record<Status, string> = {
  pending: '승인 대기', approved: '승인됨', rejected: '반려', disabled: '비활성',
}

export default function LeagueAdminRolePanel({ leagueId }: { leagueId: string }) {
  const [rows, setRows] = useState<AccountRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/admin/leagues/${leagueId}/accounts`, { cache: 'no-store' })
      const d = await r.json()
      if (!r.ok) { toast.error(d.error ?? '계정 목록 로드 실패'); return }
      setRows(d.accounts ?? [])
    } catch {
      toast.error('계정 목록 로드 실패')
    } finally { setLoading(false) }
  }, [leagueId])

  useEffect(() => { load() }, [load])

  async function setRole(row: AccountRow, role: 'member' | 'admin') {
    if (busyId) return
    setBusyId(row.id)
    try {
      const r = await fetch(`/api/admin/leagues/${leagueId}/accounts/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })
      const d = await r.json()
      if (!r.ok) { toast.error(d.error ?? '변경 실패'); return }
      const name = row.player?.name ?? row.login_id
      toast.success(role === 'admin' ? `${name} 어드민 지정 완료` : `${name} 어드민 해제`)
      await load()
    } finally { setBusyId(null) }
  }

  const adminCount = rows.filter(r => r.role === 'admin').length
  // 기본은 승인 회원만 (어드민 지정 대상). 전체 보기로 대기/반려 계정도 확인 가능.
  const visible = showAll ? rows : rows.filter(r => r.status === 'approved')

  return (
    <div className="bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-xl p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-[var(--mm-ink)] text-sm">어드민 권한 관리</h2>
          <p className="text-xs text-[var(--mm-muted)] mt-1">
            어드민으로 지정된 회원은 로그인만으로 편집 모드가 켜집니다 (PIN 과 동일 권한).
          </p>
        </div>
        <button
          onClick={load}
          aria-label="목록 새로고침"
          className="p-1.5 text-[var(--mm-muted)] hover:text-[var(--mm-ink)] cursor-pointer shrink-0"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      <div className="flex items-center gap-3 text-xs">
        <span className="text-[var(--mm-muted)]">
          현재 어드민 <b className="text-[var(--mm-ink)] tabular-nums">{adminCount}</b>명
        </span>
        <button
          onClick={() => setShowAll(v => !v)}
          className="text-[var(--mm-muted)] hover:text-[var(--mm-ink)] underline underline-offset-2 cursor-pointer"
        >
          {showAll ? '승인 회원만 보기' : '전체 계정 보기'}
        </button>
      </div>

      {adminCount === 0 && !loading && (
        <p className="text-xs text-[var(--mm-yellow-strong)] border border-[var(--mm-rule)] rounded-lg px-3 py-2">
          아직 어드민이 없습니다. 편집은 현재 PIN 으로만 가능합니다 — 최소 1명을 지정하세요.
        </p>
      )}

      {loading ? (
        <div className="py-6 flex justify-center">
          <Loader2 size={20} className="animate-spin text-[var(--mm-muted)]" />
        </div>
      ) : visible.length === 0 ? (
        <p className="py-6 text-center text-xs text-[var(--mm-muted)]">
          {showAll ? '계정이 없습니다' : '승인된 회원이 없습니다'}
        </p>
      ) : (
        <ul className="divide-y divide-[color:var(--mm-rule)] max-h-[420px] overflow-y-auto">
          {visible.map(row => {
            const isAdmin = row.role === 'admin'
            const name = row.player?.name ?? row.login_id
            return (
              <li key={row.id} className="flex items-center gap-3 py-2.5">
                <div
                  className="relative w-8 h-8 shrink-0 rounded-full overflow-hidden flex items-center justify-center bg-[var(--mm-panel-alt)] border border-[var(--mm-rule)]"
                  aria-hidden
                >
                  {row.player?.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={row.player.photo_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <UserIcon size={14} className="text-[var(--mm-muted)]" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-medium text-[var(--mm-ink)] truncate">{name}</span>
                    {isAdmin && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-[var(--mm-yellow)] text-[var(--mm-black)]">
                        <ShieldCheck size={14} aria-hidden />어드민
                      </span>
                    )}
                    {row.status !== 'approved' && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold border border-[var(--mm-rule)] text-[var(--mm-muted)]">
                        {STATUS_LABEL[row.status]}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-[var(--mm-muted)] mt-0.5">
                    {row.login_id}
                    {row.last_login_at && ` · 최근로그인 ${new Date(row.last_login_at).toLocaleDateString('ko-KR')}`}
                  </div>
                </div>

                <button
                  onClick={() => setRole(row, isAdmin ? 'member' : 'admin')}
                  disabled={busyId === row.id || (row.status !== 'approved' && !isAdmin)}
                  title={row.status !== 'approved' && !isAdmin ? '승인된 회원만 어드민으로 지정할 수 있습니다' : undefined}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold shrink-0 cursor-pointer transition-opacity disabled:opacity-40 disabled:cursor-not-allowed ${
                    isAdmin
                      ? 'border border-[var(--mm-rule)] text-[var(--mm-muted)] hover:text-[var(--mm-ink)]'
                      : 'bg-[var(--mm-ink)] text-[var(--mm-panel)] hover:opacity-90'
                  }`}
                >
                  {busyId === row.id
                    ? <Loader2 size={14} className="animate-spin" />
                    : isAdmin ? <ShieldOff size={14} /> : <ShieldCheck size={14} />}
                  {isAdmin ? '해제' : '어드민 지정'}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
