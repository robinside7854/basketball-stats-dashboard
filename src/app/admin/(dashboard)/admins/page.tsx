'use client'
// 운영 콘솔 · 공동관리자 관리 (/admin/admins)
//
// 이 화면이 존재하는 이유: 지금까지 CEO 계정은 환경변수 한 쌍이 곧 계정이라 둘이 나눠 써도
// 누가 무엇을 했는지 구분할 수 없었다. 여기서 사람별 계정을 만들고, 회수한다.
//
// 초대 링크는 **만든 직후 한 번만** 화면에 뜬다. DB 엔 sha256 해시만 남아서 나중에 다시
// 꺼낼 수 없다 — 그래서 안내 문구를 링크 옆에 붙박이로 둔다. 놓치면 초대를 다시 만들면 된다.
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  Ban,
  Check,
  Copy,
  Inbox,
  Loader2,
  Mail,
  RotateCcw,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react'

type Admin = {
  id: string
  email: string
  name: string | null
  invited_by: string | null
  created_at: string
  last_login_at: string | null
  disabled_at: string | null
}

type Invite = {
  id: string
  email: string
  invited_by: string | null
  expires_at: string
  created_at: string
}

type AccessRequest = {
  id: string
  email: string
  status: 'pending' | 'invited' | 'rejected'
  notified_at: string | null
  created_at: string
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('ko-KR', {
    year: '2-digit', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

/** 만료까지 남은 시간 — '3일 뒤 만료' 보다 '17시간 남음' 이 회수 판단에 쓸모 있다. */
function remaining(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now()
  if (ms <= 0) return '만료됨'
  const hours = Math.floor(ms / 3600_000)
  if (hours >= 24) return `${Math.floor(hours / 24)}일 ${hours % 24}시간 남음`
  return `${hours}시간 남음`
}

export default function AdminAdminsPage() {
  const [admins, setAdmins] = useState<Admin[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [requests, setRequests] = useState<AccessRequest[]>([])
  const [bootstrapEmail, setBootstrapEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [email, setEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  // 방금 만든 초대 링크. 새로고침하면 사라진다 — 다시 볼 수 없다는 뜻을 화면 동작으로도 보인다.
  const [freshLink, setFreshLink] = useState<{ email: string; url: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [a, r] = await Promise.all([
        fetch('/api/admin/admins'),
        fetch('/api/admin/access-requests?status=pending'),
      ])
      if (!a.ok) throw new Error((await a.json().catch(() => ({}))).error ?? '목록을 불러오지 못했습니다')
      const data = await a.json()
      setAdmins(data.admins ?? [])
      setInvites(data.invites ?? [])
      setBootstrapEmail(data.bootstrapEmail ?? null)
      if (r.ok) setRequests((await r.json()).requests ?? [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '목록을 불러오지 못했습니다')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function invite(target: string) {
    const value = target.trim()
    if (!value) return
    setInviting(true)
    try {
      const res = await fetch('/api/admin/admins/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: value }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? '초대를 만들지 못했습니다')
      setFreshLink({ email: value, url: data.url })
      setCopied(false)
      setEmail('')
      toast.success('초대 링크를 만들었습니다 — 아래 링크를 복사해 전달하세요')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '초대를 만들지 못했습니다')
    } finally {
      setInviting(false)
    }
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast.success('링크를 복사했습니다')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('복사에 실패했습니다 — 링크를 길게 눌러 직접 복사하세요')
    }
  }

  async function revoke(id: string) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/admin/admins/invite/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? '취소하지 못했습니다')
      toast.success('초대를 취소했습니다')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '취소하지 못했습니다')
    } finally {
      setBusyId(null)
    }
  }

  async function toggleDisabled(admin: Admin) {
    const disabled = !admin.disabled_at
    setBusyId(admin.id)
    try {
      const res = await fetch(`/api/admin/admins/${admin.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disabled }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? '변경하지 못했습니다')
      toast.success(disabled ? '계정을 비활성화했습니다' : '계정을 다시 활성화했습니다')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '변경하지 못했습니다')
    } finally {
      setBusyId(null)
    }
  }

  async function reject(id: string) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/admin/access-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'rejected' }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? '처리하지 못했습니다')
      toast.success('요청을 거절했습니다')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '처리하지 못했습니다')
    } finally {
      setBusyId(null)
    }
  }

  const cardClass = 'bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-xl'

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[var(--mm-muted)] text-sm py-20 justify-center">
        <Loader2 size={16} className="animate-spin" aria-hidden="true" />
        불러오는 중…
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-[var(--mm-ink)]">공동관리자</h1>
        <p className="text-[var(--mm-muted)] text-sm mt-1">
          운영 콘솔에 들어올 수 있는 사람을 초대하고 회수합니다
        </p>
      </div>

      {/* ── 초대 만들기 ─────────────────────────────────────────── */}
      <section className={`${cardClass} p-5 space-y-4`}>
        <div className="flex items-center gap-2">
          <UserPlus size={16} className="text-[var(--mm-yellow-strong)]" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-[var(--mm-ink)]">초대 만들기</h2>
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); void invite(email) }}
          className="flex flex-col sm:flex-row gap-2"
        >
          <label htmlFor="invite-email" className="sr-only">초대할 이메일</label>
          <input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="coadmin@example.com"
            className="flex-1 min-h-11 bg-[var(--mm-panel-alt)] border border-[var(--mm-rule)] rounded-lg px-3 py-2.5 text-[var(--mm-ink)] text-base sm:text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--mm-yellow-strong)] focus:border-[var(--mm-yellow-strong)] transition-colors"
          />
          <button
            type="submit"
            disabled={inviting || !email.trim()}
            className="min-h-11 px-4 rounded-lg bg-[var(--mm-ink)] text-[var(--mm-panel)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm transition-opacity flex items-center justify-center gap-2 cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--mm-yellow-strong)] focus-visible:outline-none"
          >
            {inviting && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
            초대 링크 생성
          </button>
        </form>

        {freshLink && (
          <div className="rounded-lg border border-[var(--mm-yellow-strong)]/40 bg-[var(--mm-yellow-soft)] p-4 space-y-2.5">
            <p className="text-xs font-semibold text-[var(--mm-yellow-strong)]">
              {freshLink.email} 님의 초대 링크
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <code className="flex-1 min-w-0 break-all text-xs bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-lg px-3 py-2.5 text-[var(--mm-ink)] font-mono">
                {freshLink.url}
              </code>
              <button
                type="button"
                onClick={() => void copyLink(freshLink.url)}
                className="min-h-11 px-4 shrink-0 rounded-lg bg-[var(--mm-ink)] text-[var(--mm-panel)] hover:opacity-90 font-medium text-sm transition-opacity flex items-center justify-center gap-2 cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--mm-yellow-strong)] focus-visible:outline-none"
              >
                {copied
                  ? <Check size={14} aria-hidden="true" />
                  : <Copy size={14} aria-hidden="true" />}
                {copied ? '복사됨' : '복사'}
              </button>
            </div>
            <p className="text-xs text-[var(--mm-yellow-strong)] font-medium">
              이 링크는 다시 볼 수 없습니다 · 72시간 후 만료
            </p>
            <p className="text-xs text-[var(--mm-ink-soft)]">
              카카오톡·문자로 본인에게 직접 전달하세요. 놓쳤다면 초대를 다시 만들면 됩니다.
            </p>
          </div>
        )}
      </section>

      {/* ── 대기 중 접근 요청 ────────────────────────────────────── */}
      {requests.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Inbox size={16} className="text-[var(--mm-yellow-strong)]" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-[var(--mm-ink)]">대기 중 접근 요청</h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--mm-yellow-soft)] text-[var(--mm-yellow-strong)] font-semibold">
              {requests.length}
            </span>
          </div>
          <div className="space-y-2">
            {requests.map((r) => (
              <div key={r.id} className={`${cardClass} p-4 flex flex-col sm:flex-row sm:items-center gap-3`}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--mm-ink)] break-all">{r.email}</p>
                  <p className="text-xs text-[var(--mm-muted)] mt-0.5">
                    {formatDate(r.created_at)}
                    {!r.notified_at && ' · 알림 메일 미발송'}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => void invite(r.email)}
                    disabled={inviting || busyId === r.id}
                    className="min-h-11 px-3 rounded-lg bg-[var(--mm-ink)] text-[var(--mm-panel)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium transition-opacity cursor-pointer flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-[var(--mm-yellow-strong)] focus-visible:outline-none"
                  >
                    <Mail size={14} aria-hidden="true" />
                    초대 보내기
                  </button>
                  <button
                    type="button"
                    onClick={() => void reject(r.id)}
                    disabled={busyId === r.id}
                    className="min-h-11 px-3 rounded-lg border border-[var(--mm-rule)] text-[var(--mm-negative)] hover:bg-[var(--mm-negative-bg)] disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--mm-yellow-strong)] focus-visible:outline-none"
                  >
                    거절
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── 관리자 목록 ─────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-[var(--mm-yellow-strong)]" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-[var(--mm-ink)]">관리자</h2>
        </div>

        <div className="space-y-2">
          {/* 부트스트랩(소유자)은 platform_admins 에 행이 없다 — 환경변수로만 존재하므로
              목록 위에 따로 그린다. 여기서 끌 수 없는 것이 곧 잠김 방지 장치다. */}
          {bootstrapEmail && (
            <div className={`${cardClass} p-4 flex flex-col sm:flex-row sm:items-center gap-2`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-[var(--mm-ink)] break-all">{bootstrapEmail}</p>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--mm-yellow-soft)] text-[var(--mm-yellow-strong)] font-semibold inline-flex items-center gap-1">
                    <ShieldCheck size={12} aria-hidden="true" />
                    소유자
                  </span>
                </div>
                <p className="text-xs text-[var(--mm-muted)] mt-0.5">
                  환경변수 계정 · 비활성화할 수 없습니다
                </p>
              </div>
            </div>
          )}

          {admins.length === 0 && !bootstrapEmail && (
            <div className="text-center py-10 text-[var(--mm-muted)] border border-dashed border-[var(--mm-rule)] rounded-xl text-sm">
              등록된 관리자가 없습니다
            </div>
          )}

          {admins.map((a) => {
            const disabled = Boolean(a.disabled_at)
            return (
              <div key={a.id} className={`${cardClass} p-4 flex flex-col sm:flex-row sm:items-center gap-3`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-[var(--mm-ink)] break-all">{a.email}</p>
                    {/* 색만으로 상태를 알리지 않는다 — 라벨을 함께 둔다 */}
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                        disabled
                          ? 'bg-[var(--mm-neutral-bg)] text-[var(--mm-neutral-fg)]'
                          : 'bg-[var(--mm-positive-bg)] text-[var(--mm-positive-fg)]'
                      }`}
                    >
                      {disabled ? '비활성' : '활성'}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--mm-muted)] mt-0.5">
                    {a.name ? `${a.name} · ` : ''}마지막 로그인 {formatDate(a.last_login_at)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void toggleDisabled(a)}
                  disabled={busyId === a.id}
                  className={`min-h-11 px-3 shrink-0 rounded-lg border text-xs font-medium transition-colors cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-[var(--mm-yellow-strong)] focus-visible:outline-none ${
                    disabled
                      ? 'border-[var(--mm-rule)] text-[var(--mm-ink)] hover:bg-[var(--mm-panel-alt)]'
                      : 'border-[var(--mm-rule)] text-[var(--mm-negative)] hover:bg-[var(--mm-negative-bg)]'
                  }`}
                >
                  {busyId === a.id
                    ? <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                    : disabled
                      ? <RotateCcw size={14} aria-hidden="true" />
                      : <Ban size={14} aria-hidden="true" />}
                  {disabled ? '다시 활성화' : '비활성화'}
                </button>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── 열린 초대 ───────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Mail size={16} className="text-[var(--mm-yellow-strong)]" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-[var(--mm-ink)]">보낸 초대</h2>
        </div>
        {invites.length === 0 ? (
          <div className="text-center py-8 text-[var(--mm-muted)] border border-dashed border-[var(--mm-rule)] rounded-xl text-sm">
            대기 중인 초대가 없습니다
          </div>
        ) : (
          <div className="space-y-2">
            {invites.map((i) => (
              <div key={i.id} className={`${cardClass} p-4 flex flex-col sm:flex-row sm:items-center gap-3`}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--mm-ink)] break-all">{i.email}</p>
                  <p className="text-xs text-[var(--mm-muted)] mt-0.5">
                    {formatDate(i.created_at)} 생성 · {remaining(i.expires_at)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void revoke(i.id)}
                  disabled={busyId === i.id}
                  className="min-h-11 px-3 shrink-0 rounded-lg border border-[var(--mm-rule)] text-[var(--mm-negative)] hover:bg-[var(--mm-negative-bg)] disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium transition-colors cursor-pointer flex items-center justify-center gap-1.5 focus-visible:ring-2 focus-visible:ring-[var(--mm-yellow-strong)] focus-visible:outline-none"
                >
                  {busyId === i.id
                    ? <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                    : <Trash2 size={14} aria-hidden="true" />}
                  초대 취소
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
