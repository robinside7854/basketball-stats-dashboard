'use client'

import { useEffect, useRef, useState } from 'react'
import { HoopsGame, type Difficulty, type GameResult } from '@/lib/game/engine'

const TIMES = [{ v: 180, l: '3분' }, { v: 300, l: '5분' }, { v: 420, l: '7분' }]
const TARGETS = [{ v: 11, l: '11점' }, { v: 21, l: '21점' }, { v: 0, l: '없음' }]
const DIFFS: { v: Difficulty; l: string }[] = [{ v: 'easy', l: '쉬움' }, { v: 'normal', l: '보통' }, { v: 'hard', l: '어려움' }]

function Choice<T extends string | number>({ label, items, value, onChange }: {
  label: string; items: { v: T; l: string }[]; value: T; onChange: (v: T) => void
}) {
  return (
    <div className="grid gap-1.5">
      <span className="text-xs font-bold tracking-wide text-[#9aa3b5]">{label}</span>
      <div className="flex flex-wrap gap-2">
        {items.map(it => (
          <button key={String(it.v)} type="button" onClick={() => onChange(it.v)}
            className={`min-w-[64px] rounded-lg border px-3 py-2 text-sm font-bold ${value === it.v ? 'border-[#ffd23f] bg-[#ffd23f] text-[#0d1018]' : 'border-[#39404f] bg-[#161a24] text-[#fff]'}`}>
            {it.l}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function GameLab() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameRef = useRef<HoopsGame | null>(null)
  const [phase, setPhase] = useState<'menu' | 'play' | 'over'>('menu')
  const [seconds, setSeconds] = useState(300)
  const [target, setTarget] = useState(11)
  const [difficulty, setDifficulty] = useState<Difficulty>('normal')
  const [vibrate, setVibrate] = useState(true)
  const [result, setResult] = useState<GameResult | null>(null)

  useEffect(() => {
    if (phase !== 'play' || !canvasRef.current) return
    const g = new HoopsGame(canvasRef.current, { seconds, target, difficulty, vibrate }, r => { setResult(r); setPhase('over') })
    gameRef.current = g
    return () => { g.destroy(); gameRef.current = null }
  }, [phase, seconds, target, difficulty, vibrate])

  // 경기 중에는 화면을 끌어도 페이지가 움직이지 않게
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const start = async () => {
    try {
      if (window.matchMedia('(pointer: coarse)').matches && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen?.()
        const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }
        await o.lock?.('landscape').catch(() => {})
      }
    } catch { /* 전체화면을 막는 브라우저(아이폰 사파리)는 그대로 진행 */ }
    setResult(null)
    setPhase('play')
  }

  const win = result ? result.score[0] > result.score[1] : false

  return (
    <div className="fixed inset-0 select-none bg-[#0d1018] text-[#fff] [word-break:keep-all]" style={{ touchAction: 'none' }}>
      {phase === 'play' && <canvas ref={canvasRef} className="block h-full w-full" style={{ touchAction: 'none' }} />}

      {phase === 'menu' && (
        <div className="flex h-full items-center justify-center overflow-y-auto px-4 py-6">
          <div className="grid w-full max-w-md gap-5">
            <div className="grid gap-1">
              <p className="text-xs font-bold tracking-[0.2em] text-[#ffd23f]">시험판 0단계</p>
              <h1 className="text-3xl font-black">미라클 후프스</h1>
              <p className="text-sm text-[#9aa3b5]">3대3 반코트 농구예요.</p>
              <p className="text-sm text-[#9aa3b5]">지금은 조작감만 보는 시험판이라 네모 캐릭터예요.</p>
            </div>
            <Choice label="경기 시간" items={TIMES} value={seconds} onChange={setSeconds} />
            <Choice label="먼저 도달하면 끝나는 점수" items={TARGETS} value={target} onChange={setTarget} />
            <Choice label="컴퓨터 실력" items={DIFFS} value={difficulty} onChange={setDifficulty} />
            <div className="grid gap-1">
              <Choice label="진동" items={[{ v: 1, l: '켜기' }, { v: 0, l: '끄기' }]} value={vibrate ? 1 : 0} onChange={v => setVibrate(v === 1)} />
              <p className="text-xs text-[#9aa3b5]">진동은 안드로이드 폰에서만 돼요.</p>
              <p className="text-xs text-[#9aa3b5]">아이폰은 브라우저가 진동을 막아요.</p>
            </div>
            <button type="button" onClick={start} className="rounded-xl bg-[#ffd23f] py-3.5 text-lg font-black text-[#0d1018] active:scale-[0.98]">경기 시작</button>
            <ul className="grid gap-1 text-sm text-[#9aa3b5]">
              <li>왼쪽 화면을 누르고 끌면 움직여요.</li>
              <li>슛 버튼을 누르고 있다가 초록 칸에서 떼세요.</li>
              <li>수비 때 슛 버튼은 점프, 패스 버튼은 스틸이에요.</li>
              <li>동료가 공을 들면 「줘!」를 눌러 받아요.</li>
              <li>슛 버튼을 짧게 톡 누르면 페이크예요. 수비가 속아 뛰면 그때 쏘세요.</li>
              <li>골대 가까이서 달리며 슛하면 덩크, 천천히 가면 레이업이에요.</li>
              <li>공이 튀면 흰 동그라미가 떨어질 곳을 알려줘요.</li>
              <li>상대 발밑에 파란 고리가 보이면 스틸할 수 있어요.</li>
              <li>3번 연속으로 넣으면 핫핸드가 돼요. 상대가 넣으면 꺼져요.</li>
              <li>공을 뺏으면 3점 선 밖으로 먼저 빼야 슛할 수 있어요.</li>
              <li>PC 는 WASD 로 움직이고 J·K·L 키를 써요.</li>
            </ul>
          </div>
        </div>
      )}

      {phase === 'over' && result && (
        <div className="flex h-full items-center justify-center overflow-y-auto px-4 py-6">
          <div className="grid w-full max-w-sm gap-4 text-center">
            <p className={`text-4xl font-black ${win ? 'text-[#ffd23f]' : 'text-[#9fb0d8]'}`}>{win ? '승리!' : '패배'}</p>
            <p className="text-5xl font-black tabular-nums">{result.score[0]} : {result.score[1]}</p>
            <div className="grid grid-cols-3 gap-2 text-sm">
              {[
                ['슛 성공', `${result.stats.made}/${result.stats.shots}`],
                ['3점', String(result.stats.threes)],
                ['어시스트', String(result.stats.assists)],
                ['스틸', String(result.stats.steals)],
                ['블록', String(result.stats.blocks)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-[#161a24] px-2 py-2">
                  <div className="text-xs text-[#9aa3b5]">{k}</div>
                  <div className="text-lg font-black tabular-nums">{v}</div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={start} className="flex-1 rounded-xl bg-[#ffd23f] py-3 font-black text-[#0d1018]">한 판 더</button>
              <button type="button" onClick={() => setPhase('menu')} className="flex-1 rounded-xl border border-[#39404f] py-3 font-bold">설정 바꾸기</button>
            </div>
          </div>
        </div>
      )}

      {phase === 'play' && (
        <div className="pointer-events-none fixed inset-0 hidden items-center justify-center bg-[#0d1018]/95 p-6 text-center text-lg font-bold portrait:[@media(pointer:coarse)]:flex">
          폰을 가로로 돌려 주세요.
        </div>
      )}
    </div>
  )
}
