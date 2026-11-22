import { PlayCircle } from 'lucide-react'
import { PLAYBACK_RATES, formatPlaybackRate, type PlaybackRate } from '@/lib/youtube/playbackRate'

// 폰 기록 집중 화면의 영상 조작 줄 — 화면 **맨 아래 고정**(2026-11-22 운영진: 영상 아래 줄은 위쪽이라
//   한 손으로 기록하면 엄지가 닿지 않았다). 세로 화면에서만 보인다(가로는 종전처럼 영상 아래 줄).
//   보이고 숨기는 규칙은 globals.css 의 .mm-rec-bottombar.
export default function RecBottomBar({
  seekRelative, togglePlay, playbackRate, setPlaybackRate, quarterPicker,
}: {
  seekRelative: (delta: number) => void
  togglePlay: () => void
  playbackRate: PlaybackRate
  setPlaybackRate: (rate: PlaybackRate) => void
  quarterPicker?: { value: number; onChange: (q: number) => void; options: readonly { value: number; label: string }[] }
}) {
  const btn = 'flex-1 min-h-12 rounded-lg text-sm font-bold text-[color:var(--mm-ink)] inline-flex items-center justify-center cursor-pointer'
  return (
    <div
      className="mm-rec-bottombar fixed inset-x-0 bottom-0 z-30 gap-1 px-2 pt-1.5 border-t border-[color:var(--mm-rule)] bg-[color:var(--mm-panel)]"
      style={{ paddingBottom: 'calc(6px + env(safe-area-inset-bottom, 0px))' }}
      role="group" aria-label="영상 조작"
    >
      <button type="button" className={btn} onClick={() => seekRelative(-10)} aria-label="10초 뒤로">−10</button>
      <button type="button" className={btn} onClick={() => seekRelative(-5)} aria-label="5초 뒤로">−5</button>
      <button type="button" className={btn} onClick={togglePlay} aria-label="재생/일시정지"><PlayCircle size={26} aria-hidden /></button>
      <button type="button" className={btn} onClick={() => seekRelative(5)} aria-label="5초 앞으로">+5</button>
      <button type="button" className={btn} onClick={() => seekRelative(10)} aria-label="10초 앞으로">+10</button>
      <button type="button"
        onClick={() => setPlaybackRate(PLAYBACK_RATES[(PLAYBACK_RATES.indexOf(playbackRate) + 1) % PLAYBACK_RATES.length])}
        aria-label={`재생 속도 ${formatPlaybackRate(playbackRate)} — 누르면 다음 속도`}
        className={`${btn} ${playbackRate === 1 ? 'border border-[color:var(--mm-rule)]' : 'bg-[color:var(--mm-yellow)] text-[color:var(--mm-black)]'}`}>
        {formatPlaybackRate(playbackRate)}
      </button>
      {quarterPicker && (
        <select
          aria-label="기록 중인 쿼터"
          value={quarterPicker.value}
          onChange={e => quarterPicker.onChange(Number(e.target.value))}
          className="flex-1 min-h-12 px-1 rounded-lg text-sm font-black border border-[color:var(--mm-rule)] bg-[color:var(--mm-panel-alt)] text-[color:var(--mm-ink)]">
          {quarterPicker.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
    </div>
  )
}
