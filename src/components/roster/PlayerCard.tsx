import { Pencil, Trash2, ChevronRight } from 'lucide-react'
import type { Player } from '@/types/database'

// mm-brand: 포지션 뱃지도 통일 톤 (뮤트 배경 + 잉크 라벨) — league/PlayerQuickViewModal.tsx 관례 재사용
const POSITION_BADGE_CLASS = 'bg-[var(--mm-panel-alt)] text-[var(--mm-ink)] border border-[var(--mm-rule)]'

function calcAge(birthdate?: string): number | null {
  if (!birthdate) return null
  const today = new Date()
  const bd = new Date(birthdate)
  let age = today.getFullYear() - bd.getFullYear()
  const notYet = today.getMonth() < bd.getMonth() || (today.getMonth() === bd.getMonth() && today.getDate() < bd.getDate())
  if (notYet) age--
  return age
}

interface Props { player: Player; onEdit?: () => void; onDelete?: () => void; onDetail: () => void }

export default function PlayerCard({ player, onEdit, onDelete, onDetail }: Props) {
  const positions = player.position ? player.position.split(',').map(p => p.trim()).filter(Boolean) : []
  const age = calcAge(player.birthdate)

  return (
    <div className="bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-xl overflow-hidden hover:border-[color:var(--mm-yellow)] transition-colors">
      <button onClick={onDetail} className="w-full flex text-left hover:bg-[var(--mm-panel-alt)]/40 transition-colors cursor-pointer">
        {/* 좌측 4:5 이미지 */}
        <div className="w-24 shrink-0 bg-[var(--mm-panel-alt)] overflow-hidden flex items-center justify-center" style={{ aspectRatio: '4/5' }}>
          {player.photo_url
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={player.photo_url} alt={player.name} className="w-full h-full object-cover" loading="lazy" decoding="async" />
            : <span className="text-6xl font-black text-[var(--mm-yellow-strong)]">{player.number}</span>
          }
        </div>

        {/* 우측 정보 — 카드 높이 꽉 채우기 */}
        <div className="flex-1 px-3 py-3 flex flex-col justify-between">
          <div className="space-y-1.5">
            <div className="text-2xl font-black font-mono text-[var(--mm-yellow-strong)] leading-none">#{player.number}</div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-lg font-bold text-[var(--mm-ink)] leading-tight">{player.name}</span>
              {player.is_pro && <span className="text-xs bg-[var(--mm-yellow)] text-[var(--mm-black)] px-1.5 py-0.5 rounded font-bold shrink-0">선출</span>}
            </div>
            {positions.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {positions.map(pos => (
                  <span key={pos} className={`text-xs px-2 py-0.5 rounded-full font-medium ${POSITION_BADGE_CLASS}`}>
                    {pos}
                  </span>
                ))}
              </div>
            )}
            {(player.height_cm || age !== null) && (
              <p className="text-sm text-[var(--mm-muted)]">
                {player.height_cm && `${player.height_cm}cm`}
                {player.height_cm && age !== null && ' · '}
                {age !== null && `만 ${age}세`}
              </p>
            )}
          </div>
          <div className="flex items-center gap-0.5 text-xs text-[var(--mm-yellow-strong)] opacity-60">
            <span>상세 보기</span><ChevronRight size={11} aria-hidden="true" />
          </div>
        </div>
      </button>

      {/* 편집/삭제 버튼 — 편집 모드에서만 표시 */}
      {(onEdit || onDelete) && (
        <div className="flex border-t border-[var(--mm-rule)]">
          {onEdit && (
            <>
              <button onClick={onEdit} className="flex-1 py-2 text-xs text-[var(--mm-muted)] hover:text-[var(--mm-ink)] hover:bg-[var(--mm-panel-alt)]/60 transition-colors flex items-center justify-center gap-1 cursor-pointer">
                <Pencil size={11} aria-hidden="true" /> 수정
              </button>
              <div className="w-px bg-[var(--mm-rule)]" />
            </>
          )}
          {onDelete && (
            <button onClick={onDelete} className="flex-1 py-2 text-xs text-red-500 hover:text-red-400 hover:bg-[var(--mm-panel-alt)]/60 transition-colors flex items-center justify-center gap-1 cursor-pointer">
              <Trash2 size={11} aria-hidden="true" /> 삭제
            </button>
          )}
        </div>
      )}
    </div>
  )
}
