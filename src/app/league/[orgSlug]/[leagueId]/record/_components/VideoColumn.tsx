import type React from 'react'
import { AlertTriangle, CheckCircle2, Play, PlayCircle, Square } from 'lucide-react'
import YouTubePlayer from '@/components/record/YouTubePlayer'
import type { SideView } from '../_lib/sides'
import type { ActiveVideo, GameSlot } from '../_lib/types'
import { PLAYBACK_RATES, formatPlaybackRate, type PlaybackRate } from '@/lib/youtube/playbackRate'

// ── 좌측: 비디오 + 경기 제어 (sticky, 뷰포트 높이 고정) ──
//   모바일: display:contents → 비디오 sticky 기준이 그리드 전체가 되어 기록 중에도 항상 보임
//   --record-header-offset: 모바일/데스크탑 상단 TabNav 아래 stick 위치 통일
//   스티키 컨테이너에 뷰포트 높이 캡 · 내부 스크롤로 마감/마감데이터 등 모든 버튼 접근 가능 (2026-07-18)
//     · 이전: 컨테이너 높이가 뷰포트보다 크면 아래 버튼이 뷰포트 밖으로 밀림
//     · 신규: max-h + overflow-y-auto 로 컨테이너 내부에서 스크롤 가능
export default function VideoColumn({
  selectedSlot, gameStarted, activeVideo, showQuarterUi, currentQuarter,
  leftSide, rightSide, sideView, ytPlayer, seekRelative, togglePlay, playbackRate, setPlaybackRate, quarterPicker, openCompleteModal,
}: {
  selectedSlot: GameSlot
  gameStarted: boolean
  activeVideo: ActiveVideo | null
  showQuarterUi: boolean
  currentQuarter: number
  leftSide: 'home' | 'away'
  rightSide: 'home' | 'away'
  sideView: (side: 'home' | 'away') => SideView
  ytPlayer: YT.Player | null
  seekRelative: (delta: number) => void
  togglePlay: () => void
  playbackRate: PlaybackRate
  setPlaybackRate: (rate: PlaybackRate) => void
  /** 폰 기록 집중 화면의 쿼터 고르기(쿼터를 나누지 않는 경기면 넘기지 않는다) */
  quarterPicker?: { value: number; onChange: (q: number) => void; options: readonly { value: number; label: string }[] }
  openCompleteModal: () => Promise<void>
}) {
  return (
    <div
      className="mm-rec-video contents lg:block lg:sticky lg:space-y-2"
      style={{ ['--record-header-offset' as string]: '56px', top: 'var(--record-header-offset)' } as React.CSSProperties}
    >

      {/* 경기 시작/마감 (2026-07-18 · 비디오 위로 이동 · 항상 노출 · 스크롤 필요 없음) */}
      <div
        className="mm-rec-hide mb-2 lg:mb-0 p-3"
        style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', borderRadius: '4px' }}
      >
        {selectedSlot?.is_complete ? (
          <div
            className="flex items-center justify-center gap-2 py-1.5 text-xs font-medium min-h-[44px]"
            style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', color: 'var(--mm-muted)', borderRadius: '4px' }}
          >
            <CheckCircle2 size={14} style={{ color: 'var(--mm-muted)' }} />경기 마감 완료
          </div>
        ) : !gameStarted ? (
          <div
            className="flex items-center justify-center gap-2 py-1.5 text-xs min-h-[44px]"
            style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', color: 'var(--mm-muted)', borderRadius: '4px' }}
          >
            <Play size={14} />우측에서 선발 선수 선택 후 시작
          </div>
        ) : (
          <div className="flex gap-2">
            <div
              className="flex-1 py-1.5 text-xs text-center font-bold min-h-[44px] flex items-center justify-center"
              style={{ background: 'var(--mm-positive-bg)', border: '1px solid var(--mm-positive)', color: 'var(--mm-positive-fg)', borderRadius: '4px' }}
            >
              경기 진행 중
            </div>
            <button
              onClick={openCompleteModal}
              className="flex items-center gap-1 px-4 py-1.5 text-xs font-bold cursor-pointer transition-colors btn-press min-h-[44px]"
              style={{ background: 'var(--mm-live-bg)', color: '#FFFFFF', borderRadius: '4px' }}
            >
              <Square size={14} />마감
            </button>
          </div>
        )}
      </div>

      {activeVideo ? (
        <div
          data-rec-sticky
          className="sticky z-[5] mb-2 lg:relative lg:top-auto lg:z-auto lg:mb-0 bg-black rounded-xl overflow-hidden"
          style={{ top: 'var(--record-header-offset, 56px)' }}
        >
          {/* 폴백 재생을 말로 알린다. 이 줄이 없던 동안 기록원은 "1쿼터"라고 적힌 화면에서
              2쿼터 영상을 보며 기록할 뻔했고, 그걸 연동 실패로 신고했다.
              ⚠ 영상 위에 겹치지 않고 **위에 쌓는다** — 반투명·블러로 가리지 않는다. */}
          {activeVideo.source === 'representative' && showQuarterUi && (
            <div
              className="flex items-start gap-1.5 px-3 py-2 text-xs leading-relaxed"
              style={{ background: 'var(--mm-panel-alt)', color: 'var(--mm-ink-soft)', borderBottom: '1px solid var(--mm-rule)' }}
            >
              <AlertTriangle size={14} aria-hidden className="shrink-0 mt-px" style={{ color: 'var(--mm-yellow-strong)' }} />
              <span>
                {currentQuarter}쿼터 영상이 없어{' '}
                {activeVideo.representativeQuarter != null
                  ? `${activeVideo.representativeQuarter}쿼터 영상을`
                  : '경기 대표 영상을'} 재생 중입니다
              </span>
            </div>
          )}
          {/* ⚠ 오버레이들은 **영상에만** 붙어야 한다.
              이 relative 래퍼가 없으면 `absolute top-2` 가 바깥 sticky 박스를 기준으로 잡혀,
              위에 쌓은 경고 배너를 LIVE 스코어보드가 덮는다. 경기 시작 뒤에는 스코어보드가
              항상 켜져 있으므로, 배너가 정작 필요한 상황에서만 안 보이게 된다(육안 검증에서 잡음). */}
          <div className="relative">
          {/* key 에 영상 주소가 들어가므로 쿼터를 넘기면 플레이어가 그 쿼터 영상으로 다시 뜬다.
              (대회는 쿼터마다 영상이 다르다 — activeVideo 가 그 판정을 담당) */}
          <YouTubePlayer
            key={activeVideo.url}
            youtubeUrl={activeVideo.url}
            startOffset={activeVideo.startOffset}
          />
          {/* 영상 조작 버튼 — PC(lg↑)는 영상 위 오버레이, 폰·태블릿은 영상 **아래** 줄(2026-11-07 운영진 — 폰에서 영상을 가렸다).
              lg 에서는 래퍼가 `contents` 라 두 묶음이 위 relative 박스 기준으로 영상 위에 뜬다. */}
          {ytPlayer && (
          <div className="flex flex-wrap gap-2 mt-2 lg:mt-0 lg:contents">
          {/* 트랜스포트 컨트롤 — 영상 좌하단 (44px 터치 타겟) */}
          {ytPlayer && (
            <div className="flex items-center gap-1 rounded-xl px-1.5 py-1 max-lg:flex-1 max-lg:justify-between max-lg:border max-lg:border-[color:var(--mm-rule)] max-lg:bg-[color:var(--mm-panel-alt)] lg:absolute lg:bottom-2 lg:left-2 lg:z-20 lg:bg-black/75 lg:backdrop-blur-sm">
              {[
                { label: '−10', delta: -10 },
                { label: '−5',  delta: -5  },
              ].map(({ label, delta }) => (
                <button key={label} onClick={() => seekRelative(delta)}
                  aria-label={`${label}초`}
                  className="min-h-[44px] min-w-[44px] px-2 rounded-lg text-sm font-bold text-[color:var(--mm-ink)] lg:text-[#fff] max-lg:hover:bg-[color:var(--mm-panel)] lg:hover:bg-white/15 cursor-pointer transition-colors inline-flex items-center justify-center">
                  {label}
                </button>
              ))}
              <button onClick={togglePlay}
                className="min-h-[44px] min-w-[44px] rounded-lg text-[color:var(--mm-ink)] lg:text-[#fff] max-lg:hover:bg-[color:var(--mm-panel)] lg:hover:bg-white/20 cursor-pointer transition-colors mx-0.5 inline-flex items-center justify-center"
                aria-label="재생/일시정지">
                <PlayCircle size={24} />
              </button>
              {[
                { label: '+5',  delta: 5  },
                { label: '+10', delta: 10 },
              ].map(({ label, delta }) => (
                <button key={label} onClick={() => seekRelative(delta)}
                  aria-label={`${label}초`}
                  className="min-h-[44px] min-w-[44px] px-2 rounded-lg text-sm font-bold text-[color:var(--mm-ink)] lg:text-[#fff] max-lg:hover:bg-[color:var(--mm-panel)] lg:hover:bg-white/15 cursor-pointer transition-colors inline-flex items-center justify-center">
                  {label}
                </button>
              ))}
              <span className="text-xs text-[color:var(--mm-muted)] ml-1 hidden lg:inline">Space·←·→·[ ]</span>
              {/* 폰·태블릿: 재생 속도는 버튼 하나(누를 때마다 다음 속도) — 두 줄이면 위에 고정된 영상 영역이
                  선발 목록의 팀 이름 줄까지 덮었다(2026-11-07 운영진 캡처) */}
              <button type="button"
                onClick={() => setPlaybackRate(PLAYBACK_RATES[(PLAYBACK_RATES.indexOf(playbackRate) + 1) % PLAYBACK_RATES.length])}
                aria-label={`재생 속도 ${formatPlaybackRate(playbackRate)} — 누르면 다음 속도`}
                className={`lg:hidden min-h-[44px] min-w-[52px] px-2 rounded-lg text-sm font-black cursor-pointer inline-flex items-center justify-center ${
                  playbackRate === 1 ? 'text-[color:var(--mm-ink)] border border-[color:var(--mm-rule)]' : 'bg-[color:var(--mm-yellow)] text-[color:var(--mm-black)]'
                }`}>
                {formatPlaybackRate(playbackRate)}
              </button>
              {/* 폰 기록 집중 화면에서만: 쿼터 고르기(쿼터 줄을 숨긴 대신). 경기당 몇 번 안 바꾸므로 작게. */}
              {quarterPicker && (
                <select
                  aria-label="기록 중인 쿼터"
                  value={quarterPicker.value}
                  onChange={e => quarterPicker.onChange(Number(e.target.value))}
                  className="mm-rec-only lg:!hidden min-h-[44px] px-1 rounded-lg text-sm font-black border border-[color:var(--mm-rule)] bg-[color:var(--mm-panel)] text-[color:var(--mm-ink)]">
                  {quarterPicker.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              )}
            </div>
          )}
          {/* 재생 속도 — 영상 우하단 (2026-11-03). 10분 경기를 8분에 기록하고 있어
              손보다 영상 재생 시간이 병목이었다. 기기별로 마지막 속도를 기억하고 쿼터를 넘겨도 유지된다.
              단축키 [ / ]. 유튜브 자체 메뉴와 달리 한 번 누르면 끝. */}
          {ytPlayer && (
            <div
              className="hidden lg:flex items-center gap-0.5 rounded-xl px-1 py-1 lg:absolute lg:bottom-2 lg:right-2 lg:z-20 lg:bg-black/75 lg:backdrop-blur-sm"
              role="group" aria-label="재생 속도"
            >
              {PLAYBACK_RATES.map(rate => {
                const on = rate === playbackRate
                return (
                  <button key={rate} onClick={() => setPlaybackRate(rate)}
                    aria-pressed={on}
                    aria-label={`재생 속도 ${formatPlaybackRate(rate)}`}
                    className={`min-h-[44px] min-w-[44px] px-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors inline-flex items-center justify-center max-lg:flex-1 ${
                      on ? 'bg-[color:var(--mm-yellow)] text-[color:var(--mm-black)]' : 'text-[color:var(--mm-ink)] lg:text-[#fff] max-lg:hover:bg-[color:var(--mm-panel)] lg:hover:bg-white/15'
                    }`}>
                    {formatPlaybackRate(rate)}
                  </button>
                )
              })}
            </div>
          )}
          </div>
          )}
          {/* 스코어보드 오버레이 — 영상 상단 좌측 (풀스크린 버튼과 겹치지 않도록 우하단→좌상단 이동) */}
          {gameStarted && (
            // 폰·태블릿은 숨긴다(2026-11-07 운영진) — 영상을 가리고, 같은 점수가 영상 아래 점수줄에 이미 있다
            <div className="hidden lg:block absolute top-2 left-2 z-10 pointer-events-none">
              {/* 좌우는 이 쿼터의 코트 배치를 따른다(sidesFlipped). 팀명·색·점수를
                  한 묶음(sideView)으로 꺼내 쓰므로 셋이 따로 놀 수 없다. */}
              <div className="flex items-stretch gap-px rounded-xl overflow-hidden shadow-2xl bg-black/80 backdrop-blur-sm border border-white/10 text-[#fff]">
                {(() => {
                  const L = sideView(leftSide)
                  const R = sideView(rightSide)
                  const cell = (v: ReturnType<typeof sideView>) => (
                    <div className="flex flex-col items-center px-3 py-1.5 min-w-[64px] max-w-[140px]">
                      <span className="text-xs font-bold truncate w-full text-center" style={{ color: v.color }}>
                        {v.team?.name ?? v.label}
                      </span>
                      <span className="text-2xl lg:text-3xl font-black tabular-nums leading-none mt-0.5">
                        {v.score}
                      </span>
                    </div>
                  )
                  return (
                    <>
                      {cell(L)}
                      {/* 구분선 + LIVE */}
                      <div className="flex flex-col items-center justify-center px-2 border-x border-white/10">
                        <span className="text-xs text-green-400 font-black tracking-widest">LIVE</span>
                        <span className="text-lg font-black text-[color:var(--mm-muted)] leading-none">:</span>
                      </div>
                      {cell(R)}
                    </>
                  )
                })()}
              </div>
            </div>
          )}
          </div>
        </div>
      ) : (
        <div
          className="mb-2 lg:mb-0 flex items-center justify-center h-40 text-sm"
          style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', color: 'var(--mm-muted)', borderRadius: '4px' }}
        >
          영상 미연동
        </div>
      )}


    </div>
  )
}
