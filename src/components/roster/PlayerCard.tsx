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

interface Props { player: Player; onEdit: () => void; onDelete: () => void; onDetail: () => void }

export default function PlayerCard({ player, onEdit, onDelete, onDetail }: Props) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden hover:border-blue-700 transition-colors">
      {/* 클릭 → 상세 페이지 */}
      <button onClick={onDetail} className="w-full p-4 flex flex-col items-center gap-3 text-left hover:bg-gray-800/40 transition-colors">
        <div className="w-14 h-14 rounded-full bg-gray-800 overflow-hidden flex items-center justify-center text-2xl font-bold text-blue-400 shrink-0">
          {player.photo_url
            ? <img src={player.photo_url} alt={player.name} className="w-full h-full object-cover" />
            : player.number
          }
        </div>
        <div className="text-center w-full">
          <div className="flex items-center justify-center gap-1.5">
            <p className="font-semibold">{player.name}</p>
            {player.is_pro && <span className="text-xs bg-yellow-500 text-black px-1.5 py-0.5 rounded font-bold">선출</span>}
          </div>
          {player.position && (
            <div className="flex flex-wrap gap-1 justify-center mt-0.5">
              {player.position.split(',').map(p => p.trim()).filter(Boolean).map(pos => (
                <span key={pos} className={`text-xs px-2 py-0.5 rounded-full text-white ${POSITION_COLORS[pos] || 'bg-gray-600'}`}>
                  {pos}
                </span>
              ))}
            </div>
          )}
        </div>
        {(player.height_cm || player.birthdate) && (
          <p className="text-xs text-gray-500">
            {player.height_cm && `${player.height_cm}cm`}
            {player.height_cm && player.birthdate && ' · '}
            {calcAge(player.birthdate) !== null && `만 ${calcAge(player.birthdate)}세`}
          </p>
        )}
        <div className="flex items-center gap-1 text-xs text-blue-400 opacity-60">
          <span>상세 보기</span><ChevronRight size={12} />
        </div>
      </button>

      {/* 편집/삭제 버튼 */}
      <div className="flex border-t border-gray-800">
        <button onClick={onEdit} className="flex-1 py-2 text-xs text-gray-400 hover:text-white hover:bg-gray-800/60 transition-colors flex items-center justify-center gap-1">
          <Pencil size={11} /> 수정
        </button>
        <div className="w-px bg-gray-800" />
        <button onClick={onDelete} className="flex-1 py-2 text-xs text-red-500 hover:text-red-400 hover:bg-gray-800/60 transition-colors flex items-center justify-center gap-1">
          <Trash2 size={11} /> 삭제
        </button>
      </div>
    </div>
  )
}
