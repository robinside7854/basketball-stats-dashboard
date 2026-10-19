'use client'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Check, FileUp, X } from 'lucide-react'
import { useEditMode } from '@/contexts/EditModeContext'
import { useGameStore } from '@/store/gameStore'
import { extractYouTubeId } from '@/lib/youtube/utils'
import { EVENT_LABELS } from '@/types/database'
import type { Player } from '@/types/database'
import {
  TWO_PT_TYPES, blocksSave, fmtClock, markDuplicates, needsAttention, parseAutoImport, toEventBody,
  type ImportRow,
} from '@/lib/autoImport'

interface Props {
  gameId: string
  youtubeUrl?: string
  players: Player[]
  onClose: () => void
  onSaved: () => void
}

type Stored = { rows: ImportRow[]; skipped: number; oppRows: number }
const storeKey = (gameId: string) => `autoImport:${gameId}`

// 검토 중인 상태는 브라우저에만 둔다(DB 변경 없음). 새로고침해도 고른 값이 남도록 경기별로 저장한다.
function loadStored(gameId: string): Stored | null {
  try {
    const raw = localStorage.getItem(storeKey(gameId))
    const v = raw ? JSON.parse(raw) : null
    return v && Array.isArray(v.rows) ? v : null
  } catch { return null }
}
function saveStored(gameId: string, v: Stored | null) {
  try {
    if (v) localStorage.setItem(storeKey(gameId), JSON.stringify(v))
    else localStorage.removeItem(storeKey(gameId))
  } catch {}
}

const qLabel = (q: number) => (q <= 4 ? `${q}Q` : `OT${q - 4}`)
const POINTS: Record<string, number> = { shot_3p: 3, shot_2p: 2, free_throw: 1, foul: 0 }
const kindLabel = (r: ImportRow) =>
  r.type ? EVENT_LABELS[r.type] : '2점슛 (종류 선택)'

const btn = 'min-h-11 px-3 rounded-lg text-sm font-bold border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mm-yellow)] disabled:opacity-40 disabled:cursor-not-allowed'
const chip = (on: boolean) =>
  `${btn} ${on ? 'bg-[var(--mm-ink)] border-[var(--mm-ink)] text-[var(--mm-panel)]' : 'bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink)] hover:border-[var(--mm-ink-soft)]'}`
const selectCls = 'min-h-11 px-2 rounded-lg bg-[var(--mm-panel-alt)] border border-[var(--mm-rule)] text-[var(--mm-ink)] text-base cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mm-yellow)]'

export default function AutoImportPanel({ gameId, youtubeUrl, players, onClose, onSaved }: Props) {
  const { teamHeaders } = useEditMode()
  const { ytPlayer, seekTo } = useGameStore()
  const [data, setData] = useState<Stored | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState<{ done: number; total: number } | null>(null)
  const [confirmOther, setConfirmOther] = useState(false)

  useEffect(() => { setData(loadStored(gameId)) }, [gameId])
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && !saving) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, saving])

  function update(next: Stored | null) {
    setData(next)
    saveStored(gameId, next)
  }
  function patchRow(key: string, patch: Partial<ImportRow>) {
    if (!data) return
    update({ ...data, rows: data.rows.map(r => (r.key === key ? { ...r, ...patch, error: undefined } : r)) })
  }

  async function onFile(file: File) {
    setLoading(true)
    try {
      const parsed = parseAutoImport(await file.text(), players)
      // 중복 판정은 지금 이 경기에 저장된 이벤트 기준 — 화면이 들고 있는 목록이 없어 GET 으로 새로 읽는다.
      let existing: { type: string; result?: string | null; video_timestamp?: number | null }[] = []
      try {
        const res = await fetch(`/api/events?gameId=${gameId}`)
        if (!res.ok) throw new Error(String(res.status))
        existing = await res.json()
      } catch {
        toast.error('기존 기록을 못 읽어 중복 확인을 하지 못했습니다')
      }
      setConfirmOther(false)
      update({ rows: markDuplicates(parsed.rows, existing), skipped: parsed.skipped, oppRows: parsed.oppRows })
      if (parsed.rows.length === 0) toast.error('불러올 후보가 없습니다')
    } finally {
      setLoading(false)
    }
  }

  const rows = useMemo(() => data?.rows ?? [], [data])
  const pending = rows.filter(r => !r.saved)
  const approved = pending.filter(r => r.approved)
  const discarded = pending.filter(r => !r.approved)
  const attention = approved.filter(needsAttention)
  const blocked = approved.filter(blocksSave)

  const currentVid = youtubeUrl ? extractYouTubeId(youtubeUrl) : null
  const fileVid = rows.find(r => r.videoId)?.videoId ?? null
  const videoMismatch = !!fileVid && fileVid !== currentVid

  const canSave = !saving && approved.length > 0 && blocked.length === 0 && (!videoMismatch || confirmOther)

  async function saveApproved() {
    if (!data || !canSave) return
    const targets = approved.map(r => r.key)
    let cur = data
    let ok = 0
    setSaving({ done: 0, total: targets.length })
    // 순차 저장 — 한 줄씩 결과를 그 줄에 남겨, 실패한 것만 다시 시도할 수 있게 한다.
    for (let i = 0; i < targets.length; i++) {
      const row = cur.rows.find(r => r.key === targets[i])!
      let patch: Partial<ImportRow>
      try {
        const res = await fetch('/api/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...teamHeaders },
          body: JSON.stringify(toEventBody(row, gameId)),
        })
        if (res.ok) { patch = { saved: true, error: undefined }; ok++ }
        else {
          const d = await res.json().catch(() => ({}))
          patch = { error: `저장 실패 (${res.status}${d.error ? ` · ${d.error}` : ''})` }
        }
      } catch {
        patch = { error: '저장 실패 (네트워크)' }
      }
      cur = { ...cur, rows: cur.rows.map(r => (r.key === row.key ? { ...r, ...patch } : r)) }
      update(cur)
      setSaving({ done: i + 1, total: targets.length })
    }
    setSaving(null)
    const failed = targets.length - ok
    if (ok > 0) onSaved()
    if (failed > 0) toast.error(`${ok}개 저장 · ${failed}개 실패 — 실패한 줄을 확인하세요`)
    else toast.success(`${ok}개 저장했습니다`)
  }

  function seek(r: ImportRow) {
    seekTo(r.ts)
    try { ytPlayer?.playVideo() } catch {}
  }

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="auto-import-title"
      // 기록 화면의 문서 단축키(Space 재생·←/→ 이동)가 패널 버튼의 Space 누르기를 가로채지 않게 막는다. Esc 는 닫기용으로 통과.
      onKeyDown={e => { if (e.key !== 'Escape') e.stopPropagation() }}
      className="fixed z-[150] inset-x-0 bottom-0 h-[62vh] lg:inset-x-auto lg:right-0 lg:top-0 lg:h-full lg:w-[32rem] bg-[var(--mm-panel)] border-t lg:border-t-0 lg:border-l border-[var(--mm-rule)] shadow-2xl flex flex-col"
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--mm-rule)]">
        <h2 id="auto-import-title" className="flex-1 text-lg font-bold text-[var(--mm-ink)]">자동 기록 불러오기</h2>
        <button onClick={onClose} disabled={!!saving} aria-label="닫기" className={`${btn} border-transparent text-[var(--mm-ink-soft)] hover:text-[var(--mm-ink)] px-2.5`}>
          <X size={20} aria-hidden />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        <label className={`${btn} inline-flex items-center gap-2 bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink)] hover:border-[var(--mm-ink-soft)] focus-within:ring-2 focus-within:ring-[var(--mm-yellow)]`}>
          <FileUp size={16} aria-hidden />
          {loading ? '읽는 중…' : rows.length ? '다른 파일 고르기' : '.jsonl 파일 고르기'}
          <input
            type="file"
            accept=".jsonl,application/jsonl,application/x-ndjson,text/plain"
            className="sr-only"
            disabled={loading || !!saving}
            onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }}
          />
        </label>

        {data && (
          <>
            <p className="text-base text-[var(--mm-ink)]" aria-live="polite">
              후보 {pending.length}개 · 승인 {approved.length} · 버림 {discarded.length} · 확인 필요 {attention.length}
              {rows.length > pending.length && <span className="text-[var(--mm-ink-soft)]"> · 저장됨 {rows.length - pending.length}</span>}
            </p>
            {(data.oppRows > 0 || data.skipped > 0) && (
              <p className="text-sm text-[var(--mm-ink-soft)]">
                {data.oppRows > 0 && `상대 득점 ${data.oppRows}줄은 불러오지 않았습니다. `}
                {data.skipped > 0 && `읽지 못했거나 대상이 아닌 줄 ${data.skipped}개는 뺐습니다.`}
              </p>
            )}

            {videoMismatch && (
              <div role="alert" className="rounded-xl border border-red-700 bg-red-950/20 p-3 space-y-2">
                <p className="flex items-center gap-2 text-base font-bold text-red-400">
                  <AlertTriangle size={20} aria-hidden />
                  {currentVid ? '다른 경기 영상의 기록입니다' : '이 경기에 영상이 없어 같은 경기인지 확인할 수 없습니다'}
                </p>
                <p className="text-sm text-[var(--mm-ink-soft)]">파일 영상 {fileVid} · 이 경기 영상 {currentVid ?? '없음'}</p>
                <label className="flex items-center gap-2 min-h-11 text-base text-[var(--mm-ink)] cursor-pointer">
                  <input type="checkbox" checked={confirmOther} onChange={e => setConfirmOther(e.target.checked)} className="w-5 h-5 cursor-pointer" />
                  확인했고 이 경기에 저장합니다
                </label>
              </div>
            )}

            <ul className="space-y-2">
              {rows.map(r => {
                const low = r.confidence != null && r.confidence < 0.5
                return (
                  <li
                    key={r.key}
                    className={`rounded-xl border p-3 space-y-2 ${r.saved ? 'border-[var(--mm-rule)] opacity-60' : r.approved ? 'border-[var(--mm-ink-soft)]' : 'border-dashed border-[var(--mm-rule)]'} bg-[var(--mm-panel-alt)]`}
                  >
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-base text-[var(--mm-ink)]">
                      {ytPlayer ? (
                        <button onClick={() => seek(r)} aria-label={`영상 ${fmtClock(r.ts)} 로 이동`} className={`${btn} px-2 font-mono border-[var(--mm-rule)] underline underline-offset-2 hover:border-[var(--mm-ink-soft)]`}>
                          {fmtClock(r.ts)}
                        </button>
                      ) : r.reviewUrl ? (
                        <a href={r.reviewUrl} target="_blank" rel="noopener noreferrer" className="min-h-11 inline-flex items-center font-mono underline underline-offset-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mm-yellow)] rounded">
                          {fmtClock(r.ts)}
                        </a>
                      ) : (
                        <span className="font-mono">{fmtClock(r.ts)}</span>
                      )}
                      <span className="font-bold">{kindLabel(r)}</span>
                      {POINTS[r.kind] > 0 && <span>+{POINTS[r.kind]}점</span>}
                      <span className={low ? 'inline-flex items-center gap-1 font-bold text-amber-500' : 'text-[var(--mm-ink-soft)]'}>
                        {low && <AlertTriangle size={16} aria-hidden />}
                        확신도 {r.confidence == null ? '-' : `${Math.round(r.confidence * 100)}%`}{low && ' (낮음)'}
                      </span>
                      {r.source && <span className="text-sm text-[var(--mm-ink-soft)]">출처 {r.source}</span>}
                    </div>

                    {r.duplicate && !r.saved && (
                      <p className="text-sm font-bold text-amber-500">이미 기록됨? — ±3초 안에 같은 종류 기록이 있어 버림으로 두었습니다</p>
                    )}

                    {r.saved ? (
                      <p className="inline-flex items-center gap-1 text-sm font-bold text-green-500"><Check size={16} aria-hidden /> 저장됨</p>
                    ) : (
                      <>
                        {r.kind === 'shot_2p' && (
                          <div role="group" aria-label="2점슛 종류" className="flex flex-wrap gap-1.5">
                            {TWO_PT_TYPES.map(t => (
                              <button key={t} onClick={() => patchRow(r.key, { type: t })} aria-pressed={r.type === t} className={chip(r.type === t)}>
                                {EVENT_LABELS[t]}
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="flex flex-wrap gap-1.5">
                          <select
                            value={r.playerId ?? ''}
                            onChange={e => patchRow(r.key, { playerId: e.target.value || null })}
                            aria-label="선수"
                            className={`${selectCls} flex-1 min-w-[10rem]`}
                          >
                            <option value="">선수 미정</option>
                            {players.map(p => <option key={p.id} value={p.id}>{p.number} {p.name}</option>)}
                          </select>
                          <select
                            value={r.quarter}
                            onChange={e => patchRow(r.key, { quarter: Number(e.target.value) })}
                            aria-label="쿼터"
                            className={selectCls}
                          >
                            {[1, 2, 3, 4, 5, 6].map(q => <option key={q} value={q}>{qLabel(q)}</option>)}
                          </select>
                        </div>
                        {!r.playerId && (r.fileName || r.fileNumber) && (
                          <p className="text-sm text-[var(--mm-ink-soft)]">파일의 선수: {[r.fileNumber && `#${r.fileNumber}`, r.fileName].filter(Boolean).join(' ')} — 명단에서 못 찾음</p>
                        )}
                        {r.approved && blocksSave(r) && <p className="text-sm font-bold text-amber-500">2점슛 종류를 골라야 저장할 수 있습니다</p>}
                        {r.approved && r.kind === 'foul' && !r.playerId && <p className="text-sm text-[var(--mm-ink-soft)]">선수 없이 저장하면 팀 파울로만 남고 개인 파울에는 잡히지 않습니다</p>}
                        <div role="group" aria-label="승인 여부" className="flex gap-1.5">
                          <button onClick={() => patchRow(r.key, { approved: true })} aria-pressed={r.approved} className={chip(r.approved)}>승인</button>
                          <button onClick={() => patchRow(r.key, { approved: false })} aria-pressed={!r.approved} className={chip(!r.approved)}>버림</button>
                        </div>
                        {r.error && <p role="alert" className="text-sm font-bold text-red-400">{r.error}</p>}
                      </>
                    )}
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>

      {data && (
        <div className="border-t border-[var(--mm-rule)] px-4 py-3 space-y-2">
          {blocked.length > 0 && <p className="text-sm text-amber-500">2점슛 종류가 비어 있는 승인 줄 {blocked.length}개</p>}
          <div className="flex gap-2">
            <button
              onClick={() => { if (confirm('검토 중인 목록을 비울까요? 이미 저장한 기록은 그대로입니다.')) update(null) }}
              disabled={!!saving}
              className={`${btn} border-[var(--mm-rule)] text-[var(--mm-ink-soft)] hover:text-[var(--mm-ink)]`}
            >
              목록 비우기
            </button>
            <button
              onClick={saveApproved}
              disabled={!canSave}
              className={`${btn} flex-1 bg-[var(--mm-ink)] border-[var(--mm-ink)] text-[var(--mm-panel)] hover:opacity-90`}
            >
              {saving ? `저장 중 ${saving.done}/${saving.total}` : `승인한 ${approved.length}개 저장`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
