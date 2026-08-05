'use client'
import { useRef, useState } from 'react'
import { Camera } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Player } from '@/types/database'

const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C']
const YEARS = Array.from({ length: 51 }, (_, i) => 1960 + i) // 1960-2010
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1)

function parseBirthdate(val?: string): { y: string; m: string; d: string } {
  if (!val) return { y: '', m: '', d: '' }
  const parts = val.split('-')
  if (parts.length === 3) return { y: parts[0], m: String(Number(parts[1])), d: String(Number(parts[2])) }
  return { y: '', m: '', d: '' }
}

interface Props { player: Player | null; teamType?: string; org?: string; onClose: () => void; onSaved: () => void }

export default function PlayerForm({ player, teamType, org = 'paranalgae', onClose, onSaved }: Props) {
  const bd = parseBirthdate(player?.birthdate)
  const [form, setForm] = useState({
    number: player?.number ?? '',
    name: player?.name ?? '',
    height_cm: player?.height_cm ?? '',
    is_pro: player?.is_pro ?? false,
  })
  const [photoUrl, setPhotoUrl] = useState<string>(player?.photo_url ?? '')
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !player?.id) {
      toast.error('선수를 먼저 저장한 후 사진을 업로드해주세요')
      return
    }
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('playerId', player.id)
    const res = await fetch('/api/players/upload-photo', { method: 'POST', body: fd })
    const data = await res.json()
    if (res.ok) {
      setPhotoUrl(data.url)
      toast.success('사진이 업로드되었습니다')
    } else {
      toast.error(data.error || '업로드 실패')
    }
    setUploading(false)
  }
  const [birthYear, setBirthYear] = useState(bd.y)
  const [birthMonth, setBirthMonth] = useState(bd.m)
  const [birthDay, setBirthDay] = useState(bd.d)
  const [selectedPositions, setSelectedPositions] = useState<string[]>(
    player?.position ? player.position.split(',').map(p => p.trim()).filter(Boolean) : []
  )

  function togglePosition(pos: string) {
    setSelectedPositions(prev =>
      prev.includes(pos) ? prev.filter(p => p !== pos) : [...prev, pos]
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const birthdate = birthYear && birthMonth && birthDay
      ? `${birthYear}-${String(birthMonth).padStart(2, '0')}-${String(birthDay).padStart(2, '0')}`
      : null
    const body = {
      ...form,
      position: selectedPositions.join(','),
      number: form.number,
      height_cm: form.height_cm ? Number(form.height_cm) : null,
      birthdate,
    }
    const qs = !player && teamType ? `?team=${teamType}&org=${org}` : ''
    const url = player ? `/api/players/${player.id}` : `/api/players${qs}`
    const method = player ? 'PUT' : 'POST'
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (res.ok) {
      onSaved()
    } else {
      const data = await res.json().catch(() => ({}))
      toast.error(data.error || '저장에 실패했습니다')
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-[var(--mm-panel)] border-[var(--mm-rule)] text-[var(--mm-ink)] max-w-md">
        <DialogHeader>
          <DialogTitle>{player ? '선수 수정' : '선수 추가'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
          {/* 프로필 사진 */}
          <div className="col-span-2 flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => player?.id ? fileInputRef.current?.click() : toast.error('선수를 먼저 저장한 후 사진을 업로드해주세요')}
              className="relative w-20 h-20 rounded-full bg-[var(--mm-panel-alt)] overflow-hidden flex items-center justify-center group border-2 border-[var(--mm-rule)] hover:border-[color:var(--color-hoop-orange-500)] transition-colors cursor-pointer"
            >
              {photoUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={photoUrl} alt="프로필" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                : <span className="text-2xl font-bold text-[var(--mm-yellow-strong)]">{form.number || '?'}</span>
              }
              <div className="absolute inset-0 bg-[var(--mm-ink)]/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                {uploading ? <span className="text-xs text-[var(--mm-panel)]">업로드 중...</span> : <Camera size={20} className="text-[var(--mm-panel)]" />}
              </div>
            </button>
            <span className="text-xs text-[var(--mm-muted)]">
              {player?.id ? '클릭하여 사진 변경' : '저장 후 사진 업로드 가능'}
            </span>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
          </div>

          <div>
            <label className="text-sm text-[var(--mm-muted)] mb-1 block">등번호 *</label>
            <Input type="text" inputMode="numeric" pattern="0{0,1}[0-9]{1,2}" placeholder="0, 00, 1-99" value={form.number} onChange={e => setForm(p => ({ ...p, number: e.target.value.replace(/[^0-9]/g, '').slice(0, 2) }))} required className="bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink)]" />
          </div>
          <div>
            <label className="text-sm text-[var(--mm-muted)] mb-1 block">이름 *</label>
            <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required className="bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink)]" />
          </div>

          {/* 생년월일 드롭다운 */}
          <div className="col-span-2">
            <label className="text-sm text-[var(--mm-muted)] mb-1 block">생년월일</label>
            <div className="flex gap-2">
              <select
                value={birthYear}
                onChange={e => setBirthYear(e.target.value)}
                className="flex-1 bg-[var(--mm-panel-alt)] border border-[var(--mm-rule)] text-[var(--mm-ink)] rounded-md px-2 py-2 text-sm cursor-pointer"
              >
                <option value="">년</option>
                {YEARS.map(y => <option key={y} value={y}>{y}년</option>)}
              </select>
              <select
                value={birthMonth}
                onChange={e => setBirthMonth(e.target.value)}
                className="w-20 bg-[var(--mm-panel-alt)] border border-[var(--mm-rule)] text-[var(--mm-ink)] rounded-md px-2 py-2 text-sm cursor-pointer"
              >
                <option value="">월</option>
                {MONTHS.map(m => <option key={m} value={m}>{m}월</option>)}
              </select>
              <select
                value={birthDay}
                onChange={e => setBirthDay(e.target.value)}
                className="w-20 bg-[var(--mm-panel-alt)] border border-[var(--mm-rule)] text-[var(--mm-ink)] rounded-md px-2 py-2 text-sm cursor-pointer"
              >
                <option value="">일</option>
                {DAYS.map(d => <option key={d} value={d}>{d}일</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-sm text-[var(--mm-muted)] mb-1 block">키 (cm)</label>
            <Input type="number" value={form.height_cm} onChange={e => setForm(p => ({ ...p, height_cm: e.target.value }))} className="bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink)]" />
          </div>

          {/* 선출 여부 */}
          <div className="flex items-center gap-3 pt-5">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.is_pro}
                onChange={e => setForm(p => ({ ...p, is_pro: e.target.checked }))}
                className="w-4 h-4 cursor-pointer"
                style={{ accentColor: 'var(--mm-yellow)' }}
              />
              <span className="text-sm text-[var(--mm-ink-soft)]">선출 선수</span>
            </label>
          </div>

          {/* 포지션 토글 */}
          <div className="col-span-2">
            <label className="text-sm text-[var(--mm-muted)] mb-2 block">포지션 (복수 선택 가능)</label>
            <div className="flex gap-2">
              {POSITIONS.map(pos => (
                <button
                  key={pos}
                  type="button"
                  onClick={() => togglePosition(pos)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors cursor-pointer ${
                    selectedPositions.includes(pos)
                      ? 'bg-[var(--mm-ink)] border-[var(--mm-ink)] text-[var(--mm-panel)]'
                      : 'bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink-soft)] hover:border-[var(--mm-ink-soft)] hover:text-[var(--mm-ink)]'
                  }`}
                >
                  {pos}
                </button>
              ))}
            </div>
          </div>

          <div className="col-span-2 flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="border-[var(--mm-rule)] text-[var(--mm-ink-soft)] cursor-pointer">취소</Button>
            <Button type="submit" className="bg-[var(--mm-ink)] text-[var(--mm-panel)] hover:brightness-95 cursor-pointer">저장</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
