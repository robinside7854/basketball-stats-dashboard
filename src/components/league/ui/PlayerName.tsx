'use client'
// 선수 이름 = 선수 카드 열기 (2026-10-14 사용자 요청 — 모바일·PC 어디서든 이름을 누르면 선수 카드).
//
// 생김새는 그 자리 글자 그대로(글꼴·색 상속) — 눌리는 곳임은 hover/포커스 밑줄로만 드러낸다.
// 자리 크기는 바꾸지 않는다: 손가락 영역은 ::after 로 위아래를 넓힌다(레이아웃 변화 없음).
// 전역 선수 카드 프로바이더(PlayerCardProvider) 밖이면 평범한 글자로 그린다.
//
// ⚠ 이름이 이미 「그 날짜 기록(박스스코어)·클립」으로 가는 링크 안에 있으면 쓰지 말 것 — 그 이동을 살린다.
import type { CSSProperties, MouseEvent, ReactNode } from 'react'
import { useOpenPlayerCard } from '@/contexts/PlayerCardContext'

type Props = {
  id: string | null | undefined
  name: string | null | undefined
  className?: string
  /** 이름 대신 그릴 내용(예: 강조 표시가 들어간 이름) — 없으면 name */
  children?: ReactNode
  /** 화면 낭독용 라벨 — 기본 「{name} 선수 카드 열기」 */
  ariaLabel?: string
  /** 손가락 영역을 위아래로 넓힐지(기본 true) — 줄 간격이 좁은 표에서는 끈다 */
  hitArea?: boolean
  title?: string
  style?: CSSProperties
}

export default function PlayerName({ id, name, className, children, ariaLabel, hitArea = true, title, style }: Props) {
  const open = useOpenPlayerCard()
  const label = children ?? name ?? ''
  if (!open || !id) {
    return <span className={className} title={title} style={style}>{label}</span>
  }
  const onClick = (e: MouseEvent<HTMLButtonElement>) => {
    // 줄 전체가 눌리는 표(펼치기 등) 안에서도 카드만 열리게 한다
    e.stopPropagation()
    e.preventDefault()
    open({ playerId: id, playerName: name ?? undefined })
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={style}
      aria-label={ariaLabel ?? (name ? `${name} 선수 카드 열기` : '선수 카드 열기')}
      className={[
        // 글꼴·색·여백 초기화는 Tailwind preflight 가 button 에 이미 해 준다(font/color inherit · padding 0)
        'cursor-pointer',
        /\btext-(center|right|left)\b/.test(className ?? '') ? '' : 'text-left',
        'underline-offset-2 decoration-[color:var(--mm-muted)] hover:underline focus-visible:underline',
        'rounded-[2px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)]',
        hitArea ? "relative after:absolute after:-inset-y-2 after:-inset-x-1 after:content-['']" : '',
        className ?? '',
      ].join(' ')}
    >
      {label}
    </button>
  )
}
