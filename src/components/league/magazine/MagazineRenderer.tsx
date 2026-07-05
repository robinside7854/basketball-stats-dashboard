'use client'
// 매거진 본문 렌더러 — 마크다운 + 참조 마커 파싱
//
// 지원 문법:
//   ## 헤더 · **볼드** · *이탤릭* · [링크](url)
//   - 리스트
//   > 인용
//   {{p:김로빈}}   → PlayerRef
//   {{t:락다운}}    → TeamRef
//   {{g:2026-07-04}} → GameRef
//
// 심플 파서 (react-markdown 등 무거운 라이브러리 회피).
// 문법이 완벽하진 않지만 Claude 가 생성한 매거진 본문에 필요한 최소셋 커버.

import React from 'react'
import { PlayerRef, TeamRef, GameRef } from './MagazineRefs'

interface TeamLike { name: string; color?: string | null }
interface PlayerLike { id: string; name: string; photo_url?: string | null }

interface Props {
  body: string
  leagueId: string
  playerMap: Record<string, PlayerLike>   // 이름 → 선수
  teamMap: Record<string, TeamLike>       // 이름 → 팀 (identity)
}

/** 마커를 React 노드로 파싱해서 반환 */
function parseInline(text: string, leagueId: string, playerMap: Record<string, PlayerLike>, teamMap: Record<string, TeamLike>): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  // 정규식: {{p:...}} | {{t:...}} | {{g:...}} | **bold** | *italic*
  const re = /(\{\{[ptg]:[^}]+\}\})|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(`[^`]+`)/g
  let lastIndex = 0
  let m: RegExpExecArray | null
  let key = 0
  while ((m = re.exec(text)) !== null) {
    // 이전 텍스트 조각
    if (m.index > lastIndex) {
      nodes.push(text.slice(lastIndex, m.index))
    }
    const tok = m[0]
    if (tok.startsWith('{{p:')) {
      const name = tok.slice(4, -2).trim()
      nodes.push(<PlayerRef key={`p-${key++}`} name={name} leagueId={leagueId} playerMap={playerMap} />)
    } else if (tok.startsWith('{{t:')) {
      const name = tok.slice(4, -2).trim()
      const team = teamMap[name]
      nodes.push(<TeamRef key={`t-${key++}`} name={name} color={team?.color ?? null} />)
    } else if (tok.startsWith('{{g:')) {
      const date = tok.slice(4, -2).trim()
      nodes.push(<GameRef key={`g-${key++}`} date={date} leagueId={leagueId} />)
    } else if (tok.startsWith('**')) {
      nodes.push(<strong key={`b-${key++}`} className="font-black text-white">{tok.slice(2, -2)}</strong>)
    } else if (tok.startsWith('*')) {
      nodes.push(<em key={`i-${key++}`} className="italic">{tok.slice(1, -1)}</em>)
    } else if (tok.startsWith('`')) {
      nodes.push(<code key={`c-${key++}`} className="px-1 py-0.5 bg-gray-800 rounded text-xs font-mono">{tok.slice(1, -1)}</code>)
    }
    lastIndex = m.index + tok.length
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }
  return nodes
}

export default function MagazineRenderer({ body, leagueId, playerMap, teamMap }: Props) {
  const lines = body.split('\n')
  const blocks: React.ReactNode[] = []
  let currentList: string[] | null = null
  let key = 0

  const flushList = () => {
    if (currentList && currentList.length > 0) {
      blocks.push(
        <ul key={`ul-${key++}`} className="list-disc list-inside space-y-1.5 my-3 text-gray-300 leading-relaxed">
          {currentList.map((item, i) => (
            <li key={i} className="pl-1">{parseInline(item, leagueId, playerMap, teamMap)}</li>
          ))}
        </ul>
      )
      currentList = null
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // 빈 줄 → 리스트 종료
    if (line.trim() === '') {
      flushList()
      continue
    }
    // 헤더
    if (line.startsWith('### ')) {
      flushList()
      blocks.push(
        <h3 key={`h3-${key++}`} className="text-lg lg:text-xl font-black text-white mt-6 mb-3 flex items-center gap-2">
          {parseInline(line.slice(4), leagueId, playerMap, teamMap)}
        </h3>
      )
      continue
    }
    if (line.startsWith('## ')) {
      flushList()
      blocks.push(
        <h2 key={`h2-${key++}`} className="text-xl lg:text-2xl font-black text-white mt-8 mb-4 pb-2 border-b border-amber-500/30 flex items-center gap-2">
          {parseInline(line.slice(3), leagueId, playerMap, teamMap)}
        </h2>
      )
      continue
    }
    if (line.startsWith('# ')) {
      flushList()
      blocks.push(
        <h1 key={`h1-${key++}`} className="text-3xl lg:text-4xl font-black text-white mt-8 mb-5">
          {parseInline(line.slice(2), leagueId, playerMap, teamMap)}
        </h1>
      )
      continue
    }
    // 인용
    if (line.startsWith('> ')) {
      flushList()
      blocks.push(
        <blockquote key={`bq-${key++}`} className="border-l-4 border-amber-500/60 pl-4 my-3 italic text-gray-400 bg-gray-900/40 py-2 pr-3 rounded-r-lg">
          {parseInline(line.slice(2), leagueId, playerMap, teamMap)}
        </blockquote>
      )
      continue
    }
    // 리스트
    if (line.startsWith('- ') || line.startsWith('* ')) {
      if (!currentList) currentList = []
      currentList.push(line.slice(2))
      continue
    }
    // 일반 문단
    flushList()
    blocks.push(
      <p key={`p-${key++}`} className="text-gray-300 leading-relaxed my-3 lg:text-lg">
        {parseInline(line, leagueId, playerMap, teamMap)}
      </p>
    )
  }
  flushList()

  return (
    <article className="magazine-body max-w-[720px] mx-auto">
      {blocks}
    </article>
  )
}
