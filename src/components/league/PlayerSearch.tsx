'use client'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { Search, X, User as UserIcon } from 'lucide-react'
import type { LeaguePlayer } from '@/types/league'

const PlayerQuickViewModal = dynamic(() => import('@/components/league/PlayerQuickViewModal'), { ssr: false })

// 헤더 선수 검색 (2026-10-10) — 리그 화면 어디서든 이름으로 선수를 찾아 선수 카드를 연다.
//
// - 게스트(`is_guest`)는 대상에서 뺀다(사용자 지시). 상대 선수는 API 기본값이 이미 뺀다.
// - 탈퇴 회원(is_active=false)은 **남긴다** — 과거 기록을 찾으러 오는 경우가 많다. 대신 뒤로 민다.
// - 명단은 검색창을 처음 열 때 한 번만 받는다. 헤더는 모든 화면에 뜨므로 페이지마다 받으면 낭비다.
// - 자동완성: 이름 부분 일치 + 초성(ㄱㄴㄷ) + 등번호.

const CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ']

function toChosung(s: string): string {
  let out = ''
  for (const ch of s) {
    const c = ch.charCodeAt(0)
    out += c >= 0xac00 && c <= 0xd7a3 ? CHO[Math.floor((c - 0xac00) / 588)] : ch
  }
  return out
}

const isAllChosung = (s: string) => /^[ㄱ-ㅎ]+$/.test(s)
const norm = (s: string) => s.normalize('NFC').replace(/\s+/g, '').toLowerCase()

type Candidate = Pick<LeaguePlayer, 'id' | 'name' | 'number' | 'position' | 'photo_url' | 'is_active'>

// 점수가 낮을수록 위. 매칭이 안 되면 null.
function matchScore(p: Candidate, q: string): number | null {
  const name = norm(p.name)
  let score: number | null = null
  if (name === q) score = 0
  else if (name.startsWith(q)) score = 1
  else if (name.includes(q)) score = 2
  else if (isAllChosung(q)) {
    const cho = toChosung(name)
    if (cho.startsWith(q)) score = 3
    else if (cho.includes(q)) score = 4
  }
  if (score === null && /^\d+$/.test(q) && p.number != null && String(p.number) === q) score = 5
  if (score === null) return null
  return p.is_active === false ? score + 10 : score
}

const MAX_RESULTS = 8

export default function PlayerSearch({ leagueId }: { leagueId: string }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [players, setPlayers] = useState<Candidate[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listId = useId()

  // 묶음(리그↔대회)을 바꾸면 명단을 다시 받는다
  useEffect(() => { setPlayers(null); setLoadError(false) }, [leagueId])

  const loadPlayers = useCallback(async () => {
    setLoadError(false)
    try {
      const res = await fetch(`/api/leagues/${leagueId}/players`)
      if (!res.ok) throw new Error(String(res.status))
      const data: LeaguePlayer[] = await res.json()
      setPlayers(data.filter(p => !p.is_guest))
    } catch {
      setLoadError(true)
    }
  }, [leagueId])

  useEffect(() => {
    if (open && players === null && !loadError) loadPlayers()
  }, [open, players, loadError, loadPlayers])

  // PC 단축키: Ctrl/⌘ + K, 또는 입력 중이 아닐 때 '/'
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault(); setOpen(true)
      } else if (e.key === '/' && !typing) {
        e.preventDefault(); setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // 열릴 때 입력창 포커스 + 배경 스크롤 잠금
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const t = setTimeout(() => inputRef.current?.focus(), 0)
    return () => { document.body.style.overflow = prev; clearTimeout(t) }
  }, [open])

  const results = useMemo(() => {
    const q = norm(query)
    if (!q || !players) return []
    return players
      .map(p => ({ p, s: matchScore(p, q) }))
      .filter((x): x is { p: Candidate; s: number } => x.s !== null)
      .sort((a, b) => a.s - b.s || a.p.name.localeCompare(b.p.name, 'ko'))
      .slice(0, MAX_RESULTS)
      .map(x => x.p)
  }, [query, players])

  const close = () => { setOpen(false); setQuery('') }

  const pick = (p: Candidate) => {
    setSelected({ id: p.id, name: p.name })
    close()
  }

  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return // 한글 조합 중 Enter/화살표는 IME 몫
    if (e.key === 'ArrowDown') {
      e.preventDefault(); setActiveIdx(i => (results.length ? (i + 1) % results.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault(); setActiveIdx(i => (results.length ? (i - 1 + results.length) % results.length : 0))
    } else if (e.key === 'Enter') {
      const p = results[activeIdx]
      if (p) { e.preventDefault(); pick(p) }
    } else if (e.key === 'Escape') {
      e.preventDefault(); close()
    }
  }

  const hasQuery = norm(query).length > 0

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="선수 검색"
        aria-haspopup="dialog"
        className="flex items-center justify-center gap-2 min-h-[44px] min-w-[44px] lg:px-3 rounded-md text-[color:var(--mm-muted)] hover:text-[color:var(--mm-ink)] hover:bg-[color:var(--mm-panel-alt)] lg:border lg:border-[color:var(--mm-rule)] transition-colors cursor-pointer btn-press focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)]"
      >
        <Search size={20} aria-hidden className="lg:w-4 lg:h-4" />
        <span className="hidden lg:inline text-sm">선수 검색</span>
        <kbd className="hidden xl:inline text-[10px] font-mono px-1.5 py-0.5 rounded border border-[color:var(--mm-rule)]">/</kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-start justify-center px-4 pt-[10vh] mm-fade-in"
          role="dialog"
          aria-modal="true"
          aria-label="선수 검색"
          onClick={e => { if (e.target === e.currentTarget) close() }}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={close} />
          <div
            className="relative z-10 w-full max-w-md rounded-md overflow-hidden"
            style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', boxShadow: '0 24px 60px -12px rgba(0,0,0,0.55)' }}
          >
            <div className="flex items-center gap-2 px-3" style={{ borderBottom: '1px solid var(--mm-rule)' }}>
              <Search size={18} aria-hidden style={{ color: 'var(--mm-muted)' }} />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => { setQuery(e.target.value); setActiveIdx(0) }}
                onKeyDown={onInputKey}
                placeholder="선수 이름 · 초성 · 등번호"
                role="combobox"
                aria-expanded={results.length > 0}
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={results[activeIdx] ? `${listId}-${results[activeIdx].id}` : undefined}
                autoComplete="off"
                enterKeyHint="search"
                // 16px 미만이면 iOS 가 입력 시 화면을 확대한다
                className="flex-1 min-w-0 h-12 bg-transparent outline-none text-base"
                style={{ color: 'var(--mm-ink)' }}
              />
              <button
                type="button"
                onClick={close}
                aria-label="검색 닫기"
                className="flex items-center justify-center w-10 h-10 rounded cursor-pointer"
                style={{ color: 'var(--mm-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
              {loadError ? (
                <div className="px-4 py-6 text-sm text-center" style={{ color: 'var(--mm-muted)' }}>
                  선수 명단을 불러오지 못했어요.{' '}
                  <button type="button" onClick={loadPlayers} className="underline cursor-pointer" style={{ color: 'var(--mm-ink)' }}>다시 시도</button>
                </div>
              ) : players === null ? (
                <div className="px-4 py-6 text-sm text-center" style={{ color: 'var(--mm-muted)' }}>불러오는 중…</div>
              ) : !hasQuery ? (
                <div className="px-4 py-6 text-sm text-center" style={{ color: 'var(--mm-muted)' }}>
                  이름을 입력하면 바로 찾아드려요 <span className="opacity-70">(예: 홍길동 · ㅎㄱㄷ · 23)</span>
                </div>
              ) : results.length === 0 ? (
                <div className="px-4 py-6 text-sm text-center" style={{ color: 'var(--mm-muted)' }}>
                  「{query.trim()}」에 해당하는 선수가 없어요
                </div>
              ) : (
                <ul id={listId} role="listbox" aria-label="검색 결과" className="py-1">
                  {results.map((p, i) => {
                    const active = i === activeIdx
                    return (
                      <li
                        key={p.id}
                        id={`${listId}-${p.id}`}
                        role="option"
                        aria-selected={active}
                        onMouseEnter={() => setActiveIdx(i)}
                        // mousedown 에서 막아야 입력창 포커스가 안 빠진다
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => pick(p)}
                        className="flex items-center gap-3 px-3 min-h-[52px] cursor-pointer"
                        style={{ background: active ? 'var(--mm-panel-alt)' : 'transparent' }}
                      >
                        <span className="w-9 h-9 rounded-full overflow-hidden shrink-0 flex items-center justify-center" style={{ background: 'var(--mm-panel-alt)', color: 'var(--mm-muted)' }}>
                          {p.photo_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.photo_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                          ) : (
                            <UserIcon size={16} aria-hidden />
                          )}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block truncate text-sm font-bold" style={{ color: 'var(--mm-ink)' }}>
                            <Highlighted text={p.name} query={query} />
                          </span>
                          {(p.position || p.is_active === false) && (
                            <span className="block truncate text-xs" style={{ color: 'var(--mm-muted)' }}>
                              {[p.position, p.is_active === false ? '탈퇴' : null].filter(Boolean).join(' · ')}
                            </span>
                          )}
                        </span>
                        {p.number != null && (
                          <span className="shrink-0 text-xs font-bold tabular-nums" style={{ color: 'var(--mm-muted)' }}>#{p.number}</span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {selected && (
        <PlayerQuickViewModal
          leagueId={leagueId}
          playerId={selected.id}
          playerName={selected.name}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  )
}

// 이름 중 입력과 겹치는 부분만 굵게(초성·등번호 매칭은 표시 없이 그대로)
function Highlighted({ text, query }: { text: string; query: string }) {
  const q = query.trim()
  if (!q) return <>{text}</>
  const i = text.toLowerCase().indexOf(q.toLowerCase())
  if (i < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, i)}
      <mark className="bg-transparent" style={{ color: 'var(--color-hoop-orange-500)' }}>{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  )
}
