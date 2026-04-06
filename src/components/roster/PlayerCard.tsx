import { Pencil, Trash2, ChevronRight } from 'lucide-react'
import type { Player } from '@/types/database'

const POSITION_COLORS: Record<string, string> = {
  PG: 'bg-blue-600', SG: 'bg-green-600', SF: 'bg-yellow-600',
  PF: 'bg-purple-600', C: 'bg-red-600',
}

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
    <div className="bg-gray-900 border border-gray-700/60 rounded-xl overflow-hidden hover:border-blue-500 transition-colors">
      <button onClick={onDetail} className="w-full flex text-left hover:bg-gray-800/40 transition-colors">
        {/* 좌측 4:5 이미지 */}
        <div className="w-24 shrink-0 bg-gray-800 overflow-hidden flex items-center justify-center" style={{ aspectRatio: '4/5' }}>
          {player.photo_url
            ? <img src={player.photo_url} alt={player.name} className="w-full h-full object-cover" />
            : <span className="text-6xl font-black text-blue-400">{player.number}</span>
          }
        </div>

        {/* 우측 정보 — 카드 높이 꽉 채우기 */}
        <div className="flex-1 px-3 py-3 flex flex-col justify-between">
          <div className="space-y-1.5">
            <div className="text-2xl font-black font-mono text-blue-400 leading-none">#{player.number}</div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-lg font-bold text-white leading-tight">{player.name}</span>
              {player.is_pro && <span className="text-xs bg-yellow-500 text-black px-1.5 py-0.5 rounded font-bold shrink-0">선출</span>}
            </div>
            {positions.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {positions.map(pos => (
                  <span key={pos} className={`text-xs px-2 py-0.5 rounded-full text-white font-medium ${POSITION_COLORS[pos] || 'bg-gray-600'}`}>
                    {pos}
                  </span>
                ))}
              </div>
            )}
            {(player.height_cm || age !== null) && (
              <p className="text-sm text-gray-400">
                {player.height_cm && `${player.height_cm}cm`}
                {player.height_cm && age !== null && ' · '}
                {age !== null && `만 ${age}세`}
              </p>
            )}
          </div>
          <div className="flex items-center gap-0.5 text-xs text-blue-400 opacity-60">
            <span>상세 보기</span><ChevronRight size={11} />
          </div>
        </div>
      </button>

      {/* 편집/삭제 버튼 — 편집 모드에서만 표시 */}
      {(onEdit || onDelete) && (
        <div className="flex border-t border-gray-800">
          {onEdit && (
            <>
              <button onClick={onEdit} className="flex-1 py-2 text-xs text-gray-400 hover:text-white hover:bg-gray-800/60 transition-colors flex items-center justify-center gap-1">
                <Pencil size={11} /> 수정
              </button>
              <div className="w-px bg-gray-800" />
            </>
          )}
          {onDelete && (
            <button onClick={onDelete} className="flex-1 py-2 text-xs text-red-500 hover:text-red-400 hover:bg-gray-800/60 transition-colors flex items-center justify-center gap-1">
              <Trash2 size={11} /> 삭제
            </button>
          )}
        </div>
      )}
    </div>
  )
}
