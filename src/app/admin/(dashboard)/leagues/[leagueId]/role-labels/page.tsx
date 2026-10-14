'use client'
// CEO 미리보기 — 역할 라벨(플레이 스타일) (2026-10-14).
//   자격을 채운 선수 전원의 라벨과 근거(자리 / 인원 · 값)를 기간(전체 / 분기)별로 본다.
//   회원 공개 스위치도 여기 있다 — 꺼져 있으면 선수 카드에서 라벨이 CEO 에게만 「미리보기」로 보인다.
//   규칙은 lib/stats/roleLabels.ts 머리 주석. 배지가 아니다(배지 제도는 2026-10-11 폐지).
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, Tags } from 'lucide-react'
import { toast } from 'sonner'
import { ROLE_LABEL_DEFS, type RoleLabelKey } from '@/lib/stats/roleLabels'

type Metric = { value: number | null; rank: number | null; n: number }
type MetricKey = 'ppg' | 'share3' | 'shareRim' | 'shareMid' | 'apg' | 'rpg' | 'orp' | 'spg' | 'bpg'
type Row = {
  player_id: string; name: string; team_name: string | null; team_color: string | null
  gp: number; fga: number
  labels: RoleLabelKey[]; qualified: RoleLabelKey[]
  metrics: Record<MetricKey, Metric>
  fg3_pct: number | null; ast_to: number | null
}
type Data = {
  league: { id: string; name: string }
  public: boolean
  quarters: Array<{ id: string; label: string }>
  period: string
  total_rounds: number; min_gp: number; pool_size: number; shot_pool_size: number
  league_fg3_pct: number | null; league_ast_to: number | null
  excluded: number
  counts: Record<RoleLabelKey, number>
  rows: Row[]
}

const COLS: Array<{ key: MetricKey; label: string; pct?: boolean }> = [
  { key: 'ppg', label: '득점' },
  { key: 'share3', label: '3점 비중', pct: true },
  { key: 'shareRim', label: '골밑·레이업 비중', pct: true },
  { key: 'shareMid', label: '미드 비중', pct: true },
  { key: 'apg', label: '어시' },
  { key: 'rpg', label: '리바' },
  { key: 'orp', label: '공격 리바' },
  { key: 'spg', label: '스틸' },
  { key: 'bpg', label: '블락' },
]
const fmt = (m: Metric, pct?: boolean) =>
  m.value === null ? '–' : pct ? `${(m.value * 100).toFixed(0)}%` : m.value.toFixed(1)

export default function RoleLabelsPreviewPage() {
  const { leagueId } = useParams<{ leagueId: string }>()
  const [period, setPeriod] = useState('all')
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // 기간이 바뀔 때마다 다시 받는다. 로딩 표시는 기간 버튼을 누르는 쪽에서 켠다(effect 안에서 동기 setState 금지).
  useEffect(() => {
    let alive = true
    ;(async () => {
      const res = await fetch(`/api/admin/leagues/${leagueId}/role-labels?period=${encodeURIComponent(period)}`).catch(() => null)
      if (!alive) return
      if (res?.ok) { setData(await res.json()); setError(null) }
      else {
        const d = res ? await res.json().catch(() => ({})) : {}
        setError(d.error ?? '불러오지 못했습니다')
      }
      setLoading(false)
    })()
    return () => { alive = false }
  }, [leagueId, period])

  function pickPeriod(id: string) {
    if (id === period) return
    setLoading(true)
    setPeriod(id)
  }

  async function togglePublic() {
    if (!data) return
    const next = !data.public
    if (!confirm(next ? '회원 선수 카드에 플레이 스타일 라벨을 공개할까요?' : '회원 화면에서 라벨을 숨길까요? (CEO 미리보기는 계속 보입니다)')) return
    setSaving(true)
    const res = await fetch(`/api/admin/leagues/${leagueId}/role-labels`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ public: next }),
    }).catch(() => null)
    setSaving(false)
    if (res?.ok) { setData({ ...data, public: next }); toast.success(next ? '공개했습니다' : '숨겼습니다') }
    else toast.error('저장 실패')
  }

  const labelKeys = Object.keys(ROLE_LABEL_DEFS) as RoleLabelKey[]

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href={`/admin/leagues/${leagueId}`} className="text-[var(--mm-muted)] hover:text-[var(--mm-ink)] transition-colors p-1.5 rounded-md hover:bg-[var(--mm-panel-alt)] cursor-pointer min-h-11 min-w-11 flex items-center justify-center" aria-label="리그 설정으로">
          <ArrowLeft size={20} />
        </Link>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-[var(--mm-ink)] flex items-center gap-2">
            <Tags size={20} className="text-[var(--mm-yellow-strong)]" /> 플레이 스타일 라벨 미리보기
          </h1>
          <p className="text-sm text-[var(--mm-muted)] mt-0.5 break-keep">
            {data?.league.name ?? ''} · 순위 자격을 채운 선수만 · 상위 10%(올라운더 20%) · 한 선수 최대 2개
          </p>
        </div>
      </div>

      {/* 공개 스위치 */}
      <div className="bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-xl p-4 flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--mm-ink)]">
            회원 공개: {data ? (data.public ? '켜짐' : '꺼짐') : '…'}
          </p>
          <p className="text-xs text-[var(--mm-muted)] break-keep">꺼져 있으면 선수 카드에서 CEO 에게만 「미리보기」로 보입니다.</p>
        </div>
        <button
          type="button"
          onClick={togglePublic}
          disabled={!data || saving}
          className="min-h-11 px-4 rounded-lg text-sm font-bold border cursor-pointer disabled:opacity-40 transition-colors"
          style={data?.public
            ? { background: 'var(--mm-panel-alt)', borderColor: 'var(--mm-rule)', color: 'var(--mm-ink)' }
            : { background: 'var(--mm-yellow)', borderColor: 'var(--mm-yellow-strong)', color: 'var(--mm-black)' }}
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : data?.public ? '회원에게 숨기기' : '회원에게 공개하기'}
        </button>
      </div>

      {/* 기간 */}
      <div className="flex gap-2 flex-wrap">
        {[{ id: 'all', label: '전체' }, ...(data?.quarters ?? [])].map(q => (
          <button key={q.id} onClick={() => pickPeriod(q.id)}
            className={`px-3.5 py-2 rounded-lg text-sm font-bold border transition-colors duration-200 cursor-pointer min-h-11 ${
              period === q.id ? 'bg-[var(--mm-yellow)] border-[var(--mm-yellow-strong)] text-[var(--mm-black)]' : 'bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-muted)] hover:text-[var(--mm-ink)]'
            }`}>
            {q.label}
          </button>
        ))}
      </div>

      {loading && <div className="flex justify-center h-24 items-center"><Loader2 size={22} className="animate-spin text-[var(--mm-muted)]" /></div>}
      {error && <p className="text-sm text-[var(--mm-negative)]">{error}</p>}

      {data && !loading && (
        <>
          <div className="bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-xl p-4 space-y-3">
            <p className="text-xs text-[var(--mm-muted)] break-keep">
              열린 날 {data.total_rounds}일 · 자격(출전 {data.min_gp}일↑) {data.pool_size}명 · 자격 미달 {data.excluded}명 ·
              슛 비중 모집단(야투 하루 5개↑) {data.shot_pool_size}명 ·
              리그 3점 성공률 {data.league_fg3_pct === null ? '–' : `${data.league_fg3_pct.toFixed(1)}%`} ·
              리그 어시/실책 {data.league_ast_to === null ? '–' : data.league_ast_to.toFixed(2)}
            </p>
            <div className="flex flex-wrap gap-2">
              {labelKeys.map(k => (
                <span key={k} className="text-xs font-bold px-2 py-1 rounded-md bg-[var(--mm-panel-alt)] text-[var(--mm-ink)]" title={ROLE_LABEL_DEFS[k].explanation}>
                  {ROLE_LABEL_DEFS[k].label} {data.counts[k]}
                </span>
              ))}
            </div>
          </div>

          <div className="bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-xl overflow-x-auto">
            <table className="w-full text-xs tabular-nums">
              <thead>
                <tr className="text-left text-[var(--mm-muted)] border-b border-[var(--mm-rule)]">
                  <th className="px-3 py-2 font-semibold whitespace-nowrap">선수</th>
                  <th className="px-3 py-2 font-semibold whitespace-nowrap">라벨</th>
                  <th className="px-2 py-2 font-semibold text-right">출전</th>
                  {COLS.map(c => <th key={c.key} className="px-2 py-2 font-semibold text-right whitespace-nowrap">{c.label}</th>)}
                  <th className="px-2 py-2 font-semibold text-right whitespace-nowrap">3P%</th>
                  <th className="px-2 py-2 font-semibold text-right whitespace-nowrap">어시/실책</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map(r => {
                  const dropped = r.qualified.filter(k => !r.labels.includes(k))
                  return (
                    <tr key={r.player_id} className="border-b border-[var(--mm-rule)] last:border-0 align-top">
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="font-bold text-[var(--mm-ink)]">{r.name}</span>
                        {r.team_name && <span className="ml-1.5 text-[var(--mm-muted)]">{r.team_name}</span>}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {r.labels.map(k => (
                            <span key={k} className="px-1.5 py-0.5 rounded font-bold whitespace-nowrap"
                              style={k === 'teamplayer'
                                ? { background: 'var(--mm-neutral-bg)', color: 'var(--mm-neutral-fg)' }
                                : { background: 'var(--mm-yellow-soft)', color: 'var(--mm-yellow-strong)' }}>
                              {ROLE_LABEL_DEFS[k].label}
                            </span>
                          ))}
                        </div>
                        {dropped.length > 0 && (
                          <p className="mt-1 text-[var(--mm-muted)] whitespace-nowrap">
                            2개 초과로 뺌: {dropped.map(k => ROLE_LABEL_DEFS[k].label).join(', ')}
                          </p>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right">{r.gp}</td>
                      {COLS.map(c => {
                        const m = r.metrics[c.key]
                        return (
                          <td key={c.key} className="px-2 py-2 text-right whitespace-nowrap">
                            <span className="text-[var(--mm-ink)]">{fmt(m, c.pct)}</span>
                            {m.rank !== null && <span className="block text-[var(--mm-muted)]">{m.rank}/{m.n}</span>}
                          </td>
                        )
                      })}
                      <td className="px-2 py-2 text-right">{r.fg3_pct === null ? '–' : r.fg3_pct.toFixed(1)}</td>
                      <td className="px-2 py-2 text-right">{r.ast_to === null ? (r.metrics.apg.value ? '실책 0' : '–') : r.ast_to.toFixed(2)}</td>
                    </tr>
                  )
                })}
                {data.rows.length === 0 && (
                  <tr><td colSpan={COLS.length + 5} className="px-3 py-6 text-center text-[var(--mm-muted)]">이 기간에 순위 자격을 채운 선수가 없습니다</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
