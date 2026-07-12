'use client'
// 매거진 컬럼 편집 모달 — 마크다운 에디터 + 실시간 미리보기
//
// 편집 가능 항목:
//   - title / subtitle
//   - body_md (마크다운 · 참조 마커 지원)
//   - cover_player_id (표지 주인공 선수 변경)
//
// 참조 마커 도움말 표시 (사용자가 수동으로 {{p:이름}} 등 삽입 가능)

import { useState, useEffect } from 'react'
import { X, Save, Eye, Edit3, Loader2, Info } from 'lucide-react'
import { toast } from 'sonner'
import MagazineRenderer from './MagazineRenderer'
import { useFocusTrap } from '@/hooks/useFocusTrap'

interface ColumnData {
  id: string
  title: string
  subtitle: string | null
  body_md: string
  cover_type: 'player' | 'banner' | 'both'
  cover_player_id: string | null
  status: string
}

interface PlayerMini {
  id: string
  name: string
  photo_url?: string | null
}

interface Props {
  leagueId: string
  column: ColumnData
  leagueHeaders: Record<string, string>
  playerNameMap: Record<string, { id: string; name: string; photo_url?: string | null }>
  teamNameMap: Record<string, { name: string; color?: string | null }>
  allPlayers: PlayerMini[]  // 표지 선수 선택 드롭다운용
  onClose: () => void
  onSaved: () => void
}

export default function ColumnEditor({
  leagueId, column, leagueHeaders, playerNameMap, teamNameMap, allPlayers, onClose, onSaved,
}: Props) {
  const [title, setTitle] = useState(column.title)
  const [subtitle, setSubtitle] = useState(column.subtitle ?? '')
  const [bodyMd, setBodyMd] = useState(column.body_md)
  const [coverPlayerId, setCoverPlayerId] = useState<string>(column.cover_player_id ?? '')
  const [tab, setTab] = useState<'edit' | 'preview'>('edit')
  const [saving, setSaving] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const trapRef = useFocusTrap(true)

  // ESC 로 닫기
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`/api/leagues/${leagueId}/columns/${column.id}`, {
        method: 'PUT',
        headers: { ...leagueHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          subtitle: subtitle.trim() || null,
          body_md: bodyMd,
          cover_player_id: coverPlayerId || null,
        }),
      })
      if (res.ok) {
        toast.success('저장 완료')
        onSaved()
        onClose()
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(`저장 실패: ${err.error ?? res.status}`)
      }
    } catch {
      toast.error('네트워크 오류')
    } finally {
      setSaving(false)
    }
  }

  // 커서 위치에 마커 삽입 헬퍼
  function insertAtCursor(marker: string) {
    const ta = document.getElementById('column-editor-body') as HTMLTextAreaElement | null
    if (!ta) return
    const start = ta.selectionStart ?? bodyMd.length
    const end = ta.selectionEnd ?? bodyMd.length
    const newBody = bodyMd.slice(0, start) + marker + bodyMd.slice(end)
    setBodyMd(newBody)
    // 커서 위치 조정
    setTimeout(() => {
      ta.focus()
      const cursor = start + marker.length
      ta.setSelectionRange(cursor, cursor)
    }, 0)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" onClick={onClose} />

      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="column-editor-title"
        className="relative bg-gray-900 border-0 sm:border border-gray-700 rounded-none sm:rounded-2xl w-full max-w-5xl h-[100dvh] sm:h-[90vh] flex flex-col z-10 shadow-2xl"
      >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-700">
          <div className="flex items-center gap-3 min-w-0">
            <Edit3 size={20} className="text-amber-400 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <h2 id="column-editor-title" className="text-white font-black text-lg truncate">매거진 편집</h2>
              <p className="text-xs text-gray-500">
                {column.status === 'draft' ? 'DRAFT · 저장 후 발행 가능' : '발행됨 · 저장 즉시 반영'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* 탭 토글 */}
            <div role="tablist" aria-label="편집기 뷰" className="flex items-center bg-gray-800 rounded-lg p-0.5">
              <button
                role="tab"
                id="column-editor-tab-edit"
                aria-selected={tab === 'edit'}
                aria-controls="column-editor-panel-edit"
                onClick={() => setTab('edit')}
                className={`px-3 py-1.5 text-xs font-bold rounded cursor-pointer transition-colors focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1 ${
                  tab === 'edit' ? 'bg-amber-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                <Edit3 size={12} className="inline mr-1" aria-hidden="true" /> 편집
              </button>
              <button
                role="tab"
                id="column-editor-tab-preview"
                aria-selected={tab === 'preview'}
                aria-controls="column-editor-panel-preview"
                onClick={() => setTab('preview')}
                className={`px-3 py-1.5 text-xs font-bold rounded cursor-pointer transition-colors focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1 ${
                  tab === 'preview' ? 'bg-amber-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                <Eye size={12} className="inline mr-1" aria-hidden="true" /> 미리보기
              </button>
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold cursor-pointer disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1"
            >
              {saving ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Save size={13} aria-hidden="true" />}
              저장
            </button>
            <button
              onClick={onClose}
              className="rounded-lg hover:bg-gray-800 text-gray-500 hover:text-white cursor-pointer inline-flex items-center justify-center min-h-11 min-w-11 focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1"
              aria-label="닫기"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* 본문 */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {tab === 'edit' ? (
            <div
              role="tabpanel"
              id="column-editor-panel-edit"
              aria-labelledby="column-editor-tab-edit"
              className="flex-1 flex flex-col min-h-0 overflow-y-auto p-5 space-y-3"
            >
              {/* 제목/부제 */}
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label htmlFor="column-editor-title-input" className="text-xs text-gray-500 font-bold uppercase tracking-widest mb-1.5 block">제목</label>
                  <input
                    id="column-editor-title-input"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white font-bold text-lg focus:border-amber-500 focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1"
                    placeholder="매거진 헤드라인"
                  />
                </div>
                <div>
                  <label htmlFor="column-editor-subtitle-input" className="text-xs text-gray-500 font-bold uppercase tracking-widest mb-1.5 block">부제 (선택)</label>
                  <input
                    id="column-editor-subtitle-input"
                    value={subtitle}
                    onChange={e => setSubtitle(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-200 focus:border-amber-500 focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1"
                    placeholder="부제 (없어도 무방)"
                  />
                </div>
                <div>
                  <label htmlFor="column-editor-cover-player" className="text-xs text-gray-500 font-bold uppercase tracking-widest mb-1.5 block">표지 주인공 선수</label>
                  <select
                    id="column-editor-cover-player"
                    value={coverPlayerId}
                    onChange={e => setCoverPlayerId(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-amber-500 focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1"
                  >
                    <option value="">— 선택 안 함 —</option>
                    {allPlayers.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 참조 마커 도움말 */}
              <div className="border border-gray-700 rounded-lg overflow-hidden">
                <button
                  onClick={() => setShowHelp(v => !v)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-gray-800/60 hover:bg-gray-800 cursor-pointer"
                >
                  <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                    <Info size={12} /> 참조 마커 (선수/팀/게임 클릭 링크)
                  </span>
                  <span className="text-xs text-gray-500">{showHelp ? '접기' : '펼치기'}</span>
                </button>
                {showHelp && (
                  <div className="p-3 space-y-2 text-xs bg-gray-900/40">
                    <div className="flex items-center gap-2 flex-wrap">
                      <code className="px-1.5 py-0.5 bg-blue-500/20 text-blue-300 rounded font-mono">{'{{p:이름}}'}</code>
                      <span className="text-gray-400">→ 선수 프로필 팝업 · 예: <code className="font-mono">{'{{p:김로빈}}'}</code></span>
                      <button onClick={() => insertAtCursor('{{p:}}')} className="ml-auto px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 cursor-pointer text-[11px]">삽입</button>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <code className="px-1.5 py-0.5 bg-purple-500/20 text-purple-300 rounded font-mono">{'{{t:팀명}}'}</code>
                      <span className="text-gray-400">→ 팀 페이지 이동 · 예: <code className="font-mono">{'{{t:락다운}}'}</code></span>
                      <button onClick={() => insertAtCursor('{{t:}}')} className="ml-auto px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 cursor-pointer text-[11px]">삽입</button>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <code className="px-1.5 py-0.5 bg-amber-500/20 text-amber-300 rounded font-mono">{'{{g:YYYY-MM-DD}}'}</code>
                      <span className="text-gray-400">→ 박스스코어 팝업 · 예: <code className="font-mono">{'{{g:2026-07-04}}'}</code></span>
                      <button onClick={() => insertAtCursor('{{g:}}')} className="ml-auto px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 cursor-pointer text-[11px]">삽입</button>
                    </div>
                    <div className="text-gray-500 text-[11px] pt-1 border-t border-gray-800">
                      마크다운: <code className="font-mono">## 헤더</code> · <code className="font-mono">**볼드**</code> · <code className="font-mono">*이탤릭*</code> · <code className="font-mono">- 리스트</code> · <code className="font-mono">{'> 인용'}</code>
                    </div>
                  </div>
                )}
              </div>

              {/* 본문 에디터 */}
              <div className="flex-1 min-h-0 flex flex-col">
                <label htmlFor="column-editor-body" className="text-xs text-gray-500 font-bold uppercase tracking-widest mb-1.5 block">본문 (마크다운)</label>
                <textarea
                  id="column-editor-body"
                  value={bodyMd}
                  onChange={e => setBodyMd(e.target.value)}
                  className="flex-1 min-h-[400px] w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-3 text-gray-200 font-mono text-sm focus:border-amber-500 focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1 resize-none"
                  placeholder="## 📸 커버 스토리&#10;&#10;이번 주..."
                  spellCheck={false}
                />
                <p className="text-[11px] text-gray-600 mt-1.5">
                  {bodyMd.length.toLocaleString()} 자 · 미리보기 탭으로 렌더 결과 확인
                </p>
              </div>
            </div>
          ) : (
            /* 미리보기 */
            <div
              role="tabpanel"
              id="column-editor-panel-preview"
              aria-labelledby="column-editor-tab-preview"
              className="flex-1 min-h-0 overflow-y-auto p-5 lg:p-10 bg-gray-900/60"
            >
              <div className="max-w-3xl mx-auto">
                <div className="mb-6 border-b border-amber-500/30 pb-4">
                  <h1 className="text-3xl lg:text-4xl font-black text-white leading-tight">{title || '(제목 없음)'}</h1>
                  {subtitle && <p className="text-lg text-gray-400 mt-2">{subtitle}</p>}
                </div>
                <MagazineRenderer
                  body={bodyMd}
                  leagueId={leagueId}
                  playerMap={playerNameMap}
                  teamMap={teamNameMap}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
