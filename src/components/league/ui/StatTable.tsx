// 기록 표 뼈대 — 가로 스크롤 상자 + 셀 규격 (리뉴얼 1단계, 2026-10-12).
//
// 배경: 공용 표 컴포넌트가 없어 표가 11벌이었고, 셀 크기·고정 열·스크롤 상자를 저마다 들고 다녔다
//   (globals.css 의 t-th / t-td 주석 참고). 열 정의를 추상화하면 정렬·비교 체크·툴팁처럼 표마다
//   다른 것을 다 품어야 해서 오히려 무거워진다 — 그래서 **얇은 태그 래퍼**만 둔다.
// 쓰는 법
//   <StatTable minWidth={640}> <thead><tr><Th sticky align="left">선수</Th><Th>PTS</Th></tr></thead>
//     <tbody><Tr><Td sticky align="left">홍길동</Td><Td emphasis>12</Td></Tr></tbody> </StatTable>
// ⚠ sticky 셀은 배경이 꼭 있어야 한다(없으면 밀려오는 칸이 비친다) — 기본 panel, 헤더 행 색을
//   바꿨다면 style 로 같은 배경을 넘긴다.

import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes, HTMLAttributes } from 'react'

type Align = 'left' | 'center' | 'right'
const ALIGN: Record<Align, string> = { left: 'text-left', center: 'text-center', right: 'text-right' }
const STICKY = 'sticky left-0 z-[1]'

export function StatTable({
  children, minWidth, className = '', tableClassName = '', ariaLabel,
}: {
  children: ReactNode
  /** 표 최소 폭(px) — 이보다 좁으면 가로 스크롤 */
  minWidth?: number
  /** 스크롤 상자 클래스(반응형 노출 hidden md:block 등) */
  className?: string
  tableClassName?: string
  ariaLabel?: string
}) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className={`w-full ${tableClassName}`} style={minWidth ? { minWidth } : undefined} aria-label={ariaLabel}>
        {children}
      </table>
    </div>
  )
}

export function Th({
  sticky = false, align = 'center', className = '', style, ...rest
}: ThHTMLAttributes<HTMLTableCellElement> & { sticky?: boolean; align?: Align }) {
  return (
    <th
      scope="col"
      className={`t-th ${ALIGN[align]} ${sticky ? STICKY : ''} ${className}`}
      style={sticky ? { background: 'var(--mm-panel)', ...style } : style}
      {...rest}
    />
  )
}

export function Td({
  sticky = false, align = 'center', emphasis = false, className = '', style, ...rest
}: TdHTMLAttributes<HTMLTableCellElement> & { sticky?: boolean; align?: Align; emphasis?: boolean }) {
  return (
    <td
      className={`${emphasis ? 't-td-key' : 't-td'} ${ALIGN[align]} ${sticky ? STICKY : ''} ${className}`}
      style={sticky ? { background: 'var(--mm-panel)', ...style } : style}
      {...rest}
    />
  )
}

export function Tr({ className = '', style, ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={className} style={{ borderBottom: '1px solid var(--mm-rule)', ...style }} {...rest} />
}
