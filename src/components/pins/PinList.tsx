'use client'
// 핀 목록 — 시간순. 클릭하면 해당 지점으로 seek.
import { Trash2, MapPin } from 'lucide-react'
import type { CoachPin } from '@/types/coachPin'

interface Props {
  pins: CoachPin[]
  onSeek: (ts: number) => void
  onDelete?: (id: string) => void
  editable?: boolean
}

function fmt(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  const mm = String(m).padStart(2, '0')
  const sss = String(ss).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${sss}` : `${mm}:${sss}`
}

export default function PinList({ pins, onSeek, onDelete, editable = false }: Props) {
  if (pins.length === 0) {
    return (
      <div className="text-center py-10 px-4 border border-dashed border-gray-700 rounded-xl">
        <MapPin size={24} className="mx-auto mb-2 text-gray-600" aria-hidden />
        <p className="text-sm text-gray-400">아직 꽂은 핀이 없습니다</p>
        <p className="text-xs text-gray-600 mt-1">영상을 보다가 핀 꽂기 버튼을 누르세요</p>
      </div>
    )
  }

  return (
    <ul className="space-y-1.5">
      {pins.map(p => (
        <li key={p.id} className="flex items-center gap-2 bg-gray-800/50 rounded-lg px-2 py-1.5 group">
          <button
            type="button"
            onClick={() => onSeek(p.video_timestamp)}
            className="flex-1 min-w-0 flex items-center gap-2.5 text-left min-h-[44px] cursor-pointer
                       hover:bg-gray-700/40 rounded px-1.5 transition-colors"
            title="이 지점으로 이동"
          >
            <span className="text-xs font-mono font-bold text-blue-400 tabular-nums shrink-0">
              {fmt(p.video_timestamp)}
            </span>
            <span className="text-sm text-white truncate">{p.label}</span>
          </button>
          {editable && onDelete && (
            <button
              type="button"
              onClick={() => onDelete(p.id)}
              className="shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center
                         text-gray-600 hover:text-red-400 cursor-pointer transition-colors"
              aria-label={`${p.label} 핀 삭제`}
            >
              <Trash2 size={15} />
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}
