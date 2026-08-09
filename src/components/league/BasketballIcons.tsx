// 농구 정체성용 SVG 아이콘 모음 — Lucide 와 함께 사용
// 모두 currentColor 기반이라 Tailwind text-* 컬러로 색 지정 가능

interface IconProps {
  size?: number
  className?: string
  spin?: boolean
}

// 농구공 — 4선 (위/아래 곡선 + 가로/세로 자오선) 구조
export function Basketball({ size = 24, className = '', spin = false }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`${spin ? 'animate-ball-spin' : ''} ${className}`}
      aria-hidden="true"
    >
      {/* 공 외곽 */}
      <circle cx="12" cy="12" r="10" />
      {/* 세로 자오선 */}
      <line x1="12" y1="2" x2="12" y2="22" />
      {/* 가로 자오선 */}
      <line x1="2" y1="12" x2="22" y2="12" />
      {/* 좌측 곡선 — 공 표면 곡률 */}
      <path d="M5 5 Q12 12 5 19" />
      {/* 우측 곡선 */}
      <path d="M19 5 Q12 12 19 19" />
    </svg>
  )
}

// 번호 붙은 농구공 — 베스트샷 핀 슬롯용 (1/2/3)
// filled=true 면 노란 배경 + 검정 번호 · false 면 아웃라인 + 회색 번호
export function NumberedBasketball({
  size = 24,
  number,
  filled = true,
  className = '',
}: { size?: number; number: 1 | 2 | 3; filled?: boolean; className?: string }) {
  const fillBg = filled ? 'var(--mm-yellow)' : 'transparent'
  const strokeColor = filled ? 'var(--mm-black)' : 'currentColor'
  const numberColor = filled ? 'var(--mm-black)' : 'currentColor'
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
    >
      {/* 공 배경 */}
      <circle cx="12" cy="12" r="10" fill={fillBg} stroke={strokeColor} strokeWidth="1.6" />
      {/* 자오선 (필드골 라인 심플하게) */}
      <path d="M12 2 Q7 12 12 22" fill="none" stroke={strokeColor} strokeWidth="1.2" opacity={filled ? 0.55 : 0.4} />
      <path d="M12 2 Q17 12 12 22" fill="none" stroke={strokeColor} strokeWidth="1.2" opacity={filled ? 0.55 : 0.4} />
      {/* 번호 — Jersey 폰트 스타일에 맞게 두꺼운 산세리프 */}
      <text
        x="12"
        y="16.2"
        textAnchor="middle"
        fontSize="11"
        fontWeight="900"
        fill={numberColor}
        fontFamily="var(--font-jersey, system-ui)"
      >
        {number}
      </text>
    </svg>
  )
}

// 농구공 로더 — Loader2 대체. mm-yellow accent 기본 적용 (E안 브랜드).
export function BasketballLoader({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <Basketball
      size={size}
      spin
      className={`text-[color:var(--mm-yellow)] ${className}`}
    />
  )
}

// Hoop · Whistle · HalfCourtDecoration 은 2026-08-10 삭제.
//   정의만 있고 소비처가 0 이었다(HalfCourtDecoration 은 2026-07-12 도입된 당일
//   다른 리팩터가 사용처를 통째로 교체해 그대로 죽었다).
//   사용자 판단: 되살리지 않는다 — 농구다움은 선수 사진·팀 컬러·경기 영상으로 낸다.
//   필요해지면 git 이력에 남아 있다.
