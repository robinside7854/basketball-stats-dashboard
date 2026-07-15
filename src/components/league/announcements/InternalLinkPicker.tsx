'use client'
// 리그 내 유저 접근 가능한 페이지 목록 · 클릭 시 편집기에 하이퍼링크 삽입
// 저자가 "라커룸으로 이동" 같은 내부 링크를 쉽게 넣을 수 있게 함
import { useEffect } from 'react'
import { X, Home, Users, Calendar as CalendarIcon, BarChart2, Trophy, Film, MapPin, Megaphone } from 'lucide-react'

interface Props {
  leagueBase: string   // `/league/[org]/[id]`
  onPick: (link: { label: string; href: string }) => void
  onClose: () => void
}

// 유저 누구나 접근 가능한 페이지 목록 (설정/드래프트 등 어드민 전용 제외)
function buildLinks(base: string) {
  return [
    {
      group: '메인',
      items: [
        { label: '홈', href: base, Icon: Home, desc: '리그 메인 화면' },
        { label: '라커룸', href: `${base}/roster`, Icon: Users, desc: '선수·팀 전체 목록' },
        { label: '경기', href: `${base}/schedule`, Icon: CalendarIcon, desc: '경기 일정과 결과' },
        { label: '스탯', href: `${base}/stats`, Icon: BarChart2, desc: '개인/팀 스탯 순위' },
      ],
    },
    {
      group: '어워즈 & 아카이브',
      items: [
        { label: '어워즈', href: `${base}/awards`, Icon: Trophy, desc: '주간/월간/시즌 수상' },
        { label: 'Stathead', href: `${base}/stathead`, Icon: BarChart2, desc: '스탯 리더보드/필터' },
        { label: '하이라이트', href: `${base}/highlights`, Icon: Film, desc: '라운드별 득점 릴' },
        { label: '공지 아카이브', href: `${base}/archive/announcements`, Icon: Megaphone, desc: '지난 공지 전체' },
      ],
    },
    {
      group: '기타',
      items: [
        { label: '둘러보기(Tour)', href: `${base}?tour=1`, Icon: MapPin, desc: '인터랙티브 안내 다시보기' },
      ],
    },
  ]
}

export default function InternalLinkPicker({ leagueBase, onPick, onClose }: Props) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const groups = buildLinks(leagueBase)

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-3"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-label="페이지 링크 선택"
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-md max-h-[80vh] bg-[color:var(--mm-panel)] shadow-[0_20px_60px_-12px_rgba(0,0,0,0.4)] rounded-md overflow-hidden flex flex-col"
        style={{ border: '1px solid var(--mm-yellow)' }}
      >
        <div className="flex items-center justify-between gap-2 px-4 py-3" style={{ background: 'var(--mm-yellow)', borderBottom: '1px solid var(--mm-black)' }}>
          <div className="inline-flex items-center gap-2">
            <MapPin size={16} className="text-[color:var(--mm-black)]" aria-hidden />
            <h2 className="text-sm font-black uppercase tracking-[0.14em]" style={{ color: 'var(--mm-black)' }}>
              페이지 링크 삽입
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded transition-colors hover:bg-black/10 cursor-pointer text-[color:var(--mm-black)]"
          >
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-3 space-y-4">
          <p className="text-[11px]" style={{ color: 'var(--mm-muted)' }}>
            원하는 페이지를 클릭하면 본문에 링크가 삽입됩니다.
          </p>
          {groups.map(g => (
            <div key={g.group}>
              <div className="text-[10px] font-black uppercase tracking-widest mb-1.5 px-1" style={{ color: 'var(--mm-yellow-strong)' }}>
                {g.group}
              </div>
              <ul className="space-y-1">
                {g.items.map(item => (
                  <li key={item.href}>
                    <button
                      type="button"
                      onClick={() => onPick({ label: item.label, href: item.href })}
                      className="w-full text-left px-3 py-2.5 rounded-sm cursor-pointer transition-colors hover:bg-[color:var(--mm-panel-alt)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] flex items-center gap-3 min-h-[52px]"
                      style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)' }}
                    >
                      <item.Icon size={18} className="text-[color:var(--mm-yellow-strong)] shrink-0" aria-hidden />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-black" style={{ color: 'var(--mm-ink)' }}>
                          {item.label}
                        </span>
                        <span className="block text-[11px]" style={{ color: 'var(--mm-muted)' }}>
                          {item.desc}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
