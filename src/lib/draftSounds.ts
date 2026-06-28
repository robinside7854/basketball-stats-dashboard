// 드래프트 효과음 — WebAudio 합성 (외부 오디오 파일 불필요)
// 자동재생 정책상 사용자 상호작용 후에 소리가 난다. 음소거 토글 지원.

let ctx: AudioContext | null = null
let muted = false

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

export function setMuted(m: boolean) { muted = m }
export function isMuted() { return muted }
/** 사용자 제스처 시 호출해 오디오 컨텍스트 활성화 */
export function primeAudio() { ac() }

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.15) {
  const c = ac()
  if (!c || muted) return
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, c.currentTime + start)
  g.gain.setValueAtTime(0, c.currentTime + start)
  g.gain.linearRampToValueAtTime(gain, c.currentTime + start + 0.01)
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + start + dur)
  osc.connect(g); g.connect(c.destination)
  osc.start(c.currentTime + start)
  osc.stop(c.currentTime + start + dur + 0.02)
}

/** 카운트다운 비프 (마지막 초마다) */
export function playBeep(urgent = false) {
  tone(urgent ? 1320 : 880, 0, 0.12, 'square', 0.12)
}

/** 픽 확정 부저 */
export function playBuzzer() {
  tone(440, 0, 0.18, 'sawtooth', 0.16)
  tone(660, 0.12, 0.22, 'sawtooth', 0.16)
  tone(880, 0.26, 0.3, 'square', 0.14)
}

/** 추첨 드럼롤 (약 2.4초) — 빠른 타격음 연타 후 상승 */
export function playDrumroll() {
  const c = ac()
  if (!c || muted) return
  for (let i = 0; i < 28; i++) {
    tone(140 + i * 4, i * 0.08, 0.05, 'triangle', 0.08)
  }
  // 마무리 팡파레
  tone(523, 2.3, 0.25, 'square', 0.16)
  tone(784, 2.45, 0.4, 'square', 0.18)
}

/** 내 차례 알림 — 880Hz 삼연타(80ms 톤 × 3, 100ms 간격). 총 ~520ms */
export function playMyTurnBeep() {
  // 0s, 0.18s, 0.36s 에 시작 — 80ms tone + 100ms gap
  tone(880, 0, 0.08, 'square', 0.18)
  tone(880, 0.18, 0.08, 'square', 0.18)
  tone(880, 0.36, 0.08, 'square', 0.18)
}

/** 추첨 호른 — 1픽 공이 떨어지는 순간 (약 0.7초의 승리감 있는 팡파레) */
export function playLotteryHorn() {
  // "타-다!" 패턴: 880Hz square 300ms → 660Hz square 200ms → 1320Hz square 200ms 슬라이드
  tone(880, 0, 0.3, 'square', 0.18)
  tone(660, 0.25, 0.2, 'square', 0.16)
  tone(1320, 0.45, 0.25, 'square', 0.18)
  // 잔향 — 살짝 늦게 sine 으로 빛나게
  tone(1760, 0.5, 0.4, 'sine', 0.1)
}
