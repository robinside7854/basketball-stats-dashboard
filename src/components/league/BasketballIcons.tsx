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

// 농구골대 (림 + 백보드) — 미니멀 라인 아이콘
export function Hoop({ size = 24, className = '' }: IconProps) {
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
      className={className}
      aria-hidden="true"
    >
      {/* 백보드 */}
      <rect x="4" y="3" width="16" height="9" rx="0.5" />
      {/* 림 (타원) */}
      <ellipse cx="12" cy="14" rx="4" ry="1" />
      {/* 네트 라인 */}
      <line x1="9" y1="14" x2="10" y2="20" />
      <line x1="11" y1="14" x2="11.5" y2="20" />
      <line x1="13" y1="14" x2="12.5" y2="20" />
      <line x1="15" y1="14" x2="14" y2="20" />
    </svg>
  )
}

// 휘슬 — 심판 / 게임 시작
export function Whistle({ size = 24, className = '' }: IconProps) {
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
      className={className}
      aria-hidden="true"
    >
      <path d="M3 12c0-2.8 2.2-5 5-5h7l4-2v8l-4-2H8" />
      <circle cx="9" cy="13" r="3" />
    </svg>
  )
}

// 하프코트 라인 데코 — 헤더/배너 배경 장식용 (절대 위치 가정)
export function HalfCourtDecoration({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 240"
      className={className}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {/* 외곽 라인 */}
      <rect x="2" y="2" width="396" height="236" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.18" />
      {/* 미드라인 (중앙 수직) */}
      <line x1="200" y1="2" x2="200" y2="238" stroke="currentColor" strokeWidth="1.5" opacity="0.18" />
      {/* 센터 서클 */}
      <circle cx="200" cy="120" r="40" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.18" />
      {/* 좌측 키 (Free Throw Lane) */}
      <rect x="2" y="80" width="60" height="80" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.18" />
      {/* 좌측 자유투 호 */}
      <path d="M 62 80 A 30 30 0 0 1 62 160" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.18" />
      {/* 좌측 3점 라인 */}
      <path d="M 2 50 A 100 100 0 0 1 2 190" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.18" />
      {/* 우측 키 */}
      <rect x="338" y="80" width="60" height="80" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.18" />
      {/* 우측 자유투 호 */}
      <path d="M 338 80 A 30 30 0 0 0 338 160" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.18" />
      {/* 우측 3점 라인 */}
      <path d="M 398 50 A 100 100 0 0 0 398 190" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.18" />
    </svg>
  )
}
