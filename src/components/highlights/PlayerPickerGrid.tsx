'use client'
// PlayerPickerGrid — 하이라이트 "선수별 보기" 진입 UI (리그·팀 공용)
//
// 왜 그리드인가: 이전엔 <select> 하나에 45명이 전부 들어가 모바일 네이티브 휠을
// 한참 굴려야 했고, 고른 뒤 "보기" 버튼을 또 눌러야 했다. 동호회원은 이름보다
// 얼굴로 사람을 찾으므로 사진 + 등번호 타일을 깔고, 이름 검색으로 좁히고,
// 타일을 누르면 곧바로 이동한다(2단계 → 1단계).
//
// 리그(/league/...)와 팀(/[org]/[team]/...) 두 화면이 라우팅 경로와 데이터
// 출처만 다르므로 그 둘만 prop 으로 받는다. 얇은 래퍼 2개가 이 컴포넌트를 감싼다.
import { useEffect, useId, useMemo, useState } from 'react'
import Link from 'next/link'
import { Users, Search, X } from 'lucide-react'

interface Props {
  /** 선수 목록 API 경로 (GET, 배열 응답) */
  endpoint: string
  /** 선수별 페이지 경로의 앞부분. 최종 링크 = `${hrefBase}/${playerId}` */
  hrefBase: string
}

/** API 원본 — league_players 와 players 두 테이블을 함께 받으므로 필드가 느슨하다 */
type ApiPlayer = {
  id: string
  name: string
  number?: number | string | null
  photo_url?: string | null
  is_active?: boolean
  is_guest?: boolean
}

type PlayerLite = { id: string; name: string; number: number | null; photo: string | null }

/** 이 인원 이하면 검색창을 숨긴다 — 한 화면에 다 보이는데 입력창을 두면 방해만 된다 */
const SEARCH_THRESHOLD = 10
/** 로딩 스켈레톤 타일 수 — 실제 명단이 오기 전 자리만 예약한다 */
const SKELETON_COUNT = 12

function toNumber(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const trimmed = v.trim()
  if (!trimmed) return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

/** 검색 비교용 정규화 — 공백 제거 + 소문자 (한글 부분일치) */
function norm(s: string): string {
  return s.replace(/\s+/g, '').toLowerCase()
}

export default function PlayerPickerGrid({ endpoint, hrefBase }: Props) {
  const [players, setPlayers] = useState<PlayerLite[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const searchId = useId()

  useEffect(() => {
    // loading 초기값이 true 라 여기서 다시 세우지 않는다 — 이펙트 본문에서
    // setState 를 부르면 연쇄 렌더가 생긴다(react-hooks/set-state-in-effect).
    let cancelled = false
    fetch(endpoint)
      .then(r => (r.ok ? r.json() : []))
      .then((d: ApiPlayer[]) => {
        if (cancelled) return
        setPlayers(
          (Array.isArray(d) ? d : [])
            // 탈퇴 회원 제외 (플래그가 없는 응답은 그대로 통과)
            .filter(p => p.is_active !== false)
            // 게스트 제외 — 하이라이트가 사실상 없어 목록만 길어진다.
            // ⚠ 서버(/players GET)의 기본 동작은 건드리지 않는다. 기록 입력·명단
            //    화면이 게스트를 필요로 하기 때문이다. 그래서 여기 클라이언트에서만 뺀다.
            //    is_guest 컬럼이 없는 팀 명단(players)은 마이그레이션 057 과 같은
            //    이름 규칙('게스트' 포함)으로 판별한다.
            .filter(p => p.is_guest !== true && !p.name.includes('게스트'))
            .map(p => ({
              id: p.id,
              name: p.name,
              number: toNumber(p.number),
              photo: p.photo_url ?? null,
            }))
            .sort((a, b) => {
              const na = a.number ?? 999
              const nb = b.number ?? 999
              if (na !== nb) return na - nb
              return a.name.localeCompare(b.name, 'ko')
            }),
        )
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [endpoint])

  const filtered = useMemo(() => {
    const q = norm(query)
    if (!q) return players
    return players.filter(
      p => norm(p.name).includes(q) || (p.number != null && String(p.number).startsWith(q)),
    )
  }, [players, query])

  const showSearch = !loading && players.length > SEARCH_THRESHOLD

  return (
    <section
      className="p-3 lg:p-4"
      style={{
        background: 'var(--mm-panel)',
        border: '1px solid var(--mm-rule)',
        borderRadius: 'var(--mm-radius-card)',
      }}
      aria-labelledby={`${searchId}-title`}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <Users size={16} style={{ color: 'var(--mm-yellow-strong)' }} aria-hidden="true" />
        <h2 id={`${searchId}-title`} className="font-bold text-sm" style={{ color: 'var(--mm-ink)' }}>
          선수별 보기
        </h2>
        {!loading && players.length > 0 && (
          <span className="text-xs" style={{ color: 'var(--mm-muted)' }}>
            {players.length}명
          </span>
        )}
      </div>

      {showSearch && (
        <div className="mt-3">
          <label htmlFor={searchId} className="sr-only">
            선수 이름 또는 등번호 검색
          </label>
          <div
            className="flex items-center gap-2 px-3"
            style={{
              background: 'var(--mm-panel)',
              border: '1px solid var(--mm-rule)',
              borderRadius: 'var(--mm-radius-ctl)',
            }}
          >
            <Search size={15} style={{ color: 'var(--mm-muted)' }} aria-hidden="true" />
            <input
              id={searchId}
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="이름 또는 등번호"
              autoComplete="off"
              className="flex-1 min-w-0 min-h-[44px] bg-transparent text-sm outline-none"
              style={{ color: 'var(--mm-ink)' }}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="검색어 지우기"
                className="shrink-0 flex items-center justify-center w-11 h-11 -mr-2 cursor-pointer"
                style={{ color: 'var(--mm-muted)' }}
              >
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <>
          <span className="sr-only">선수 목록을 불러오는 중입니다</span>
          <ul
            className="mt-3 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2"
            aria-hidden="true"
          >
            {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
              <li key={i} className="p-1.5">
                <div
                  className="w-full aspect-square animate-pulse"
                  style={{ background: 'var(--mm-panel-alt)', borderRadius: 'var(--mm-radius-ctl)' }}
                />
                <div
                  className="mt-1.5 h-3 w-3/4 mx-auto animate-pulse"
                  style={{ background: 'var(--mm-panel-alt)', borderRadius: '4px' }}
                />
              </li>
            ))}
          </ul>
        </>
      ) : players.length === 0 ? (
        <p className="mt-3 text-sm" style={{ color: 'var(--mm-muted)' }}>
          등록된 선수가 없습니다.
        </p>
      ) : filtered.length === 0 ? (
        <p className="mt-3 text-sm" style={{ color: 'var(--mm-muted)' }}>
          &lsquo;{query}&rsquo; 와 일치하는 선수가 없습니다.
        </p>
      ) : (
        <ul className="mt-3 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
          {filtered.map(p => (
            <li key={p.id}>
              <Link
                href={`${hrefBase}/${p.id}`}
                className="block p-1.5 cursor-pointer hover:-translate-y-0.5 hover:bg-[var(--mm-panel-alt)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mm-yellow-strong)]"
                style={{
                  borderRadius: 'var(--mm-radius-card)',
                  transition:
                    'transform var(--mm-motion-fast) var(--mm-ease-out), background-color var(--mm-motion-fast) var(--mm-ease-out)',
                }}
              >
                <div
                  className="relative w-full aspect-square overflow-hidden"
                  style={{
                    background: 'var(--mm-panel-alt)',
                    border: '1px solid var(--mm-rule)',
                    borderRadius: 'var(--mm-radius-ctl)',
                  }}
                >
                  {p.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.photo}
                      alt={`${p.name} 선수 사진`}
                      loading="lazy"
                      className="w-full h-full"
                      style={{ objectFit: 'cover', objectPosition: 'top', display: 'block' }}
                    />
                  ) : (
                    <span
                      className="absolute inset-0 flex items-center justify-center font-bold text-2xl"
                      style={{ color: 'var(--mm-muted)' }}
                      aria-hidden="true"
                    >
                      {p.name.trim().charAt(0)}
                    </span>
                  )}
                  {p.number != null && (
                    <span
                      className="absolute left-1 top-1 px-1.5 font-jersey font-bold text-xs tabular-nums"
                      style={{
                        background: 'var(--mm-ink)',
                        color: 'var(--mm-ground)',
                        borderRadius: 'var(--mm-radius-chip)',
                      }}
                    >
                      {p.number}
                    </span>
                  )}
                </div>
                <span
                  className="block mt-1.5 text-[13px] font-bold text-center leading-tight truncate"
                  style={{ color: 'var(--mm-ink)' }}
                >
                  {p.name}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
