// 선수 얼굴 — 사진, 없으면 이름 첫 글자 (리뉴얼 1단계, 2026-10-12).
//
// 배경: 리더보드·박스스코어·마이페이지가 원형 사진을 각자 그리면서 사진이 없을 때의 대체가
//   「이름 두 글자」「성 뺀 이름」「사람 아이콘」으로 갈렸고, 크기도 화면마다 달랐다.
//   한 사람이 화면을 옮겨 다닐 때 같은 얼굴로 보여야 한다.
// 규칙
//   · 크기는 5단(24/32/40/56/80) 중에서 고른다 — 중간값을 만들면 다시 갈라진다.
//   · 사진은 next/image(fill) — next.config 의 Supabase 호스트만 옵티마이저를 탄다.
//     ⚠ 허용되지 않은 호스트를 next/image 에 넘기면 렌더 자체가 터지므로, 그 경우엔 <img> 로 내린다.
//   · 팀 색 테두리(ringColor)는 호출부가 accentOrInk 등으로 대비를 맞춰 넘긴다.

import Image from 'next/image'

export type AvatarSize = 24 | 32 | 40 | 56 | 80

const OPTIMIZABLE = /^https:\/\/[^/]+\.supabase\.(co|in)\//

interface Props {
  src?: string | null
  /** 대체 글자(첫 글자)와 alt 의 출처 */
  name: string
  size?: AvatarSize
  /** 팀 색 테두리 — 없으면 1px rule */
  ringColor?: string | null
  /** 이름이 바로 옆에 적혀 있으면 true — 스크린리더가 같은 이름을 두 번 읽지 않게 한다 */
  decorative?: boolean
  priority?: boolean
  className?: string
}

export default function Avatar({
  src, name, size = 40, ringColor, decorative = false, priority = false, className = '',
}: Props) {
  const initial = (name ?? '').trim().charAt(0) || '?'
  const ring = ringColor ? `2px solid ${ringColor}` : '1px solid var(--mm-rule)'
  const alt = decorative ? '' : name

  return (
    <span
      className={`relative inline-flex items-center justify-center shrink-0 overflow-hidden rounded-full select-none ${className}`}
      style={{ width: size, height: size, background: 'var(--mm-panel-alt)', border: ring }}
      aria-hidden={decorative || undefined}
    >
      {src ? (
        OPTIMIZABLE.test(src) ? (
          <Image src={src} alt={alt} fill sizes={`${size}px`} preload={priority} className="object-cover object-top" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- 옵티마이저 허용 호스트가 아님(위 주석)
          <img src={src} alt={alt} loading={priority ? 'eager' : 'lazy'} className="absolute inset-0 w-full h-full object-cover object-top" />
        )
      ) : (
        <span
          className="font-black leading-none"
          style={{ color: 'var(--mm-ink-soft)', fontSize: Math.max(11, Math.round(size * 0.42)) }}
          role={decorative ? undefined : 'img'}
          aria-label={decorative ? undefined : name}
        >
          {initial}
        </span>
      )}
    </span>
  )
}
