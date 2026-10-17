import { ArrowLeftRight, ChevronDown, Link2, Loader2, Plus, Search, Trash2, Youtube } from 'lucide-react'
import type { GameSlot, QuarterVideoMap, Setter } from '../_lib/types'

// 영상 — 접어 둔다. 제목 규칙이 맞는 날은 자동 매핑이 전부 붙이므로(리그 282경기
//   중 281건) 여기를 열 일이 없다. 규칙이 깨진 날에만 펼쳐 손으로 붙인다.
//   ⚠ 손으로 붙일 수단 자체를 없애면 그날 기록 전체가 영상 없이 진행된다 — 감추는 것이지
//     치우는 것이 아니다. 영상이 하나도 없으면 처음부터 펼쳐서 보여 준다.
//   ⚠ 열림 상태(videoPanelOpen)와 그걸 되살리는 effect 는 useQuarterVideos 에 있다.
export default function VideoPanel({
  selectedSlot, slots, isTournament, currentQuarter, setCurrentQuarter, playingQuarter,
  quarterVideos, showQuarterUi, sidesFlipped, toggleQuarterSides, setQuarterSplitOpen,
  videoPanelOpen, setVideoPanelOpen,
  ytInput, setYtInput, ytSaving, ytList, ytListLoading, ytPickerOpen, setYtPickerOpen,
  ytTargetQuarter, setYtTargetQuarter,
  attachVideo, clearQuarterVideo, loadYoutubeList,
}: {
  selectedSlot: GameSlot
  slots: GameSlot[]
  isTournament: boolean
  currentQuarter: number
  setCurrentQuarter: Setter<number>
  playingQuarter: number | null
  quarterVideos: QuarterVideoMap
  showQuarterUi: boolean
  sidesFlipped: boolean
  toggleQuarterSides: () => Promise<void>
  setQuarterSplitOpen: Setter<boolean>
  videoPanelOpen: boolean
  setVideoPanelOpen: Setter<boolean>
  ytInput: string
  setYtInput: Setter<string>
  ytSaving: boolean
  ytList: { video_id: string; title: string; url: string; thumbnail: string | null }[]
  ytListLoading: boolean
  ytPickerOpen: boolean
  setYtPickerOpen: Setter<boolean>
  ytTargetQuarter: number
  setYtTargetQuarter: Setter<number>
  attachVideo: (raw: string) => Promise<void>
  clearQuarterVideo: (quarter: number) => Promise<void>
  loadYoutubeList: () => Promise<void>
}) {
  return (
    <details
      className="mt-3 pt-3"
      style={{ borderTop: '1px dashed var(--mm-rule)' }}
      open={videoPanelOpen}
      onToggle={e => setVideoPanelOpen(e.currentTarget.open)}
    >
      <summary
        className="flex items-center gap-2 min-h-11 cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
      >
        <ChevronDown
          size={14}
          aria-hidden
          className="shrink-0 transition-transform duration-200"
          style={{ color: 'var(--mm-muted)', transform: videoPanelOpen ? 'none' : 'rotate(-90deg)' }}
        />
        <span className="t-label" style={{ color: 'var(--mm-muted)' }}>영상</span>
        {(() => {
          const qs = Object.keys(quarterVideos).map(Number).sort((a, b) => a - b)
          if (qs.length > 0) {
            // 빠진 쿼터를 함께 적는다. 안 적으면 "2개 연결됨"이 정상인지 사고인지 구분되지
            //   않는다 — 업로더가 안 올린 쿼터가 있는 날이 실제로 있다(9/12).
            const missing = [1, 2, 3, 4].filter(q => !quarterVideos[q])
            return (
              <span className="inline-flex items-center gap-1.5 text-xs flex-wrap" style={{ color: 'var(--mm-ink-soft)' }}>
                <Youtube size={14} aria-hidden style={{ color: 'var(--mm-live)' }} />
                {qs.length}개 연결됨 · {qs.map(q => `${q}Q`).join('·')}
                {missing.length > 0 && (
                  <span style={{ color: 'var(--mm-muted)' }}>· 없음 {missing.map(q => `${q}Q`).join('·')}</span>
                )}
              </span>
            )
          }
          if (selectedSlot.youtube_url) {
            return (
              <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: 'var(--mm-ink-soft)' }}>
                <Youtube size={14} aria-hidden style={{ color: 'var(--mm-live)' }} />
                대표 영상 1개
              </span>
            )
          }
          return <span className="text-xs" style={{ color: 'var(--mm-muted)' }}>연결 안 됨 — 눌러서 붙이기</span>
        })()}
      </summary>
      <div className="mt-2">
      {/* 쿼터별 영상 4칸. 촬영본이 쿼터로 쪼개져 올라오므로 한 칸으로는 담기지 않는다.
          아래 링크 입력·목록 고르기는 여기서 고른 쿼터를 채운다.
          ⚠ 2026-09-07 리그에도 열었다 — 미라클이 쿼터제로 바뀌어 영상이 대진×쿼터로 올라온다.
          쿼터 태그된 영상이 하나도 없는 날(옛 번호형 제목)은 통째로 감춘다 — 그 경기에는
          쿼터 개념이 없어서 빈 칸 네 개가 "연동 실패"처럼 읽힌다. */}
      {showQuarterUi && (
        <div className="mb-3">
          <div className="flex items-baseline gap-2 flex-wrap mb-2">
            <span className="t-label" style={{ color: 'var(--mm-muted)' }}>쿼터별 영상</span>
            <span className="text-xs" style={{ color: 'var(--mm-muted)' }}>
              쿼터를 누르면 그 쿼터 영상으로 바뀝니다
            </span>
          </div>
          {/* ⚠ **올라온 쿼터만 칸으로 만든다.** 1~4를 늘 네 칸 그리면 업로더가 안 올린 쿼터가
              `미연결` 이라는 이름의 실패처럼 읽힌다(9/12 가 실제로 그랬다). 없는 쿼터는
              아래 점선 `+ N쿼터` 로만 남겨 "붙일 자리"라는 뜻을 분명히 한다. */}
          <ul className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 list-none p-0 m-0">
            {[1, 2, 3, 4, 5, 6].filter(q => quarterVideos[q]).map(q => {
              const v = quarterVideos[q]
              const isTarget = ytTargetQuarter === q
              // ⚠ `재생 중` 은 **실제 재생 중인 영상의 쿼터**에만 붙인다(playingQuarter).
              //   예전에는 `currentQuarter === q` 여서, 영상 없는 쿼터로 기록하고 있으면
              //   그 칸에 `재생 중`+`미연결` 이 동시에 붙고 화면에는 다른 쿼터 영상이 돌았다.
              //   `기록 중` 과 `재생 중` 은 서로 다른 말이므로 갈릴 때는 갈린 대로 보여 준다.
              const isRecording = currentQuarter === q
              const isPlaying = playingQuarter === q
              const badge = isRecording && isPlaying ? '기록·재생'
                : isPlaying ? '재생 중'
                : isRecording ? '기록 중'
                : null
              // 카드를 누르면 **그 쿼터로 넘어간다** — 재생도 기록도 함께.
              //   예전에는 붙일 대상(ytTargetQuarter)만 바꿔서, 3쿼터를 눌러도 2쿼터
              //   영상이 계속 돌았다. "눌러도 안 바뀐다"는 신고가 이것이다.
              //   쿼터를 넘기는 다른 입구(기록 패드 위 탭)는 경기 시작 뒤에만 나타나서,
              //   시작 전에는 영상을 넘길 방법이 화면에 아예 없었다.
              const goToQuarter = () => {
                setCurrentQuarter(q)
                setYtTargetQuarter(q)
                setYtPickerOpen(false)
              }
              return (
                <li key={q} className="flex items-stretch gap-1">
                  <button
                    type="button"
                    onClick={goToQuarter}
                    aria-pressed={isTarget}
                    aria-label={`${q}쿼터로 이동 — 영상 재생·기록 대상`}
                    title={`${q}쿼터 영상을 재생하고 이 쿼터로 기록합니다`}
                    className="mm-press flex-1 min-w-0 flex flex-col items-start justify-center px-2 py-1.5 min-h-[44px] text-xs font-bold cursor-pointer transition-colors duration-200 hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                    style={{
                      background: isTarget ? 'var(--mm-yellow)' : 'var(--mm-panel-alt)',
                      color: isTarget ? 'var(--mm-black)' : 'var(--mm-ink-soft)',
                      border: `1px solid ${isTarget ? 'var(--mm-yellow)' : 'var(--mm-rule)'}`,
                      borderRadius: '4px',
                    }}
                  >
                    <span className="whitespace-nowrap">{q}쿼터</span>
                    {/* 둘째 줄은 배지 아니면 「연결됨」 — 둘을 같이 두면 390px 타일(114px)에서 3줄이 된다.
                        배지(기록 중/재생 중)가 붙은 쿼터는 영상이 있는 쿼터이므로 「연결됨」을 따로
                        적을 이유가 없다. 노란 배경은 "지금 링크를 붙일 대상", 배지는 "기록/재생 중". */}
                    {badge ? (
                      <span
                        className="mt-0.5 px-1 py-px text-xs font-bold rounded-sm whitespace-nowrap"
                        style={{
                          background: isTarget ? 'rgba(0,0,0,0.18)' : 'var(--mm-panel)',
                          color: isTarget ? 'var(--mm-black)' : 'var(--mm-ink-soft)',
                        }}
                      >
                        {badge}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 mt-0.5 font-normal whitespace-nowrap">
                        <Youtube size={14} aria-hidden /> 연결됨
                      </span>
                    )}
                  </button>
                  {v && (
                    <button
                      type="button"
                      onClick={() => clearQuarterVideo(q)}
                      aria-label={`${q}쿼터 영상 해제`}
                      title={`${q}쿼터 영상 해제`}
                      className="mm-press shrink-0 w-11 min-h-[44px] inline-flex items-center justify-center cursor-pointer transition-colors duration-200 hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                      style={{ background: 'var(--mm-panel-alt)', color: 'var(--mm-muted)', border: '1px solid var(--mm-rule)', borderRadius: '4px' }}
                    >
                      <Trash2 size={14} aria-hidden />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>

          {/* 아직 영상이 없는 쿼터 — 칸이 아니라 "붙일 자리"로 보이게 점선 칩으로 둔다.
              ⚠ 1~4쿼터만. 연장(5·6)은 "혹시 몰라서" 칸을 열어 두면 4쿼터가 다 찬 날에도
                `영상 없음` 줄이 남아, 없는 칸을 지운 효과가 사라진다. 연장 영상이 이미
                붙어 있으면 위 카드 목록에 그대로 나온다. */}
          {(() => {
            const open = [1, 2, 3, 4].filter(q => !quarterVideos[q])
            if (open.length === 0) return null
            return (
              <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                <span className="text-xs shrink-0" style={{ color: 'var(--mm-muted)' }}>영상 없음</span>
                {open.map(q => {
                  const isTarget = ytTargetQuarter === q
                  return (
                    <button
                      key={q}
                      type="button"
                      onClick={() => { setYtTargetQuarter(q); setYtPickerOpen(false) }}
                      aria-pressed={isTarget}
                      title={`${q}쿼터에 붙일 영상을 고릅니다`}
                      className="mm-press inline-flex items-center gap-1 px-2.5 min-h-11 text-xs font-bold cursor-pointer transition-colors duration-200 hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                      style={{
                        background: isTarget ? 'var(--mm-yellow)' : 'transparent',
                        color: isTarget ? 'var(--mm-black)' : 'var(--mm-muted)',
                        border: `1px dashed ${isTarget ? 'var(--mm-yellow)' : 'var(--mm-rule)'}`,
                        borderRadius: '4px',
                      }}
                    >
                      <Plus size={14} strokeWidth={2.5} aria-hidden />{q}쿼터
                    </button>
                  )
                })}
              </div>
            )
          })()}
        </div>
      )}

      {/* 화면 좌우 반전은 **영상과 무관하다** — 영상 속 코트 배치가 화면과 반대인 쿼터에 쓴다.
          홈·원정(저장값)은 그대로이고 화면 배치만 그 쿼터에서 뒤집는다 — 팀 줄의 「홈↔원정」과 다르다.
          쿼터 UI 를 감춘 경기에서도 닿아야 해서 게이트 밖에 둔다. */}
      <div className="flex items-center gap-2 flex-wrap mb-2">
        {selectedSlot.home_team_id && selectedSlot.away_team_id && !isTournament && (
          <button
            type="button"
            onClick={toggleQuarterSides}
            aria-pressed={sidesFlipped}
            title={`${currentQuarter}쿼터에서만 화면의 왼쪽·오른쪽 팀 배치를 뒤집습니다 — 영상 속 코트 방향에 맞추는 용도입니다. 홈·원정과 기록·점수는 그대로입니다`}
            className="mm-press inline-flex items-center gap-1.5 shrink-0 px-2.5 min-h-11 text-xs font-bold cursor-pointer transition-colors duration-200 hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            style={{
              background: sidesFlipped ? 'var(--mm-yellow)' : 'var(--mm-panel-alt)',
              color: sidesFlipped ? 'var(--mm-black)' : 'var(--mm-ink-soft)',
              border: `1px solid ${sidesFlipped ? 'var(--mm-yellow)' : 'var(--mm-rule)'}`,
              borderRadius: '4px',
            }}
          >
            <ArrowLeftRight size={14} strokeWidth={2.5} aria-hidden />
            {showQuarterUi ? `${currentQuarter}쿼터 화면만 좌우 반전` : '화면 좌우 반전'}{sidesFlipped ? ' · 켜짐' : ''}
          </button>
        )}
        {/* 되돌아올 길 — 쿼터 영상이 없는 날도 나중에 쿼터별로 쪼갠 영상을 붙일 수 있어야 한다 */}
        {!showQuarterUi && (
          <button
            type="button"
            onClick={() => setQuarterSplitOpen(true)}
            className="mm-press inline-flex items-center gap-1.5 px-2.5 min-h-11 text-xs font-bold cursor-pointer transition-colors duration-200 hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            style={{ background: 'var(--mm-panel-alt)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)', borderRadius: '4px' }}
          >
            <Plus size={14} strokeWidth={2.5} aria-hidden />쿼터별로 나눠 붙이기
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="t-label shrink-0" style={{ color: 'var(--mm-muted)' }}>
          {showQuarterUi ? `${ytTargetQuarter}쿼터 영상` : '경기 영상'}
        </span>
        <label htmlFor="yt-url-input" className="sr-only">YouTube 영상 링크</label>
        <input
          id="yt-url-input"
          value={ytInput}
          onChange={e => setYtInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !ytSaving) { e.preventDefault(); attachVideo(ytInput) } }}
          placeholder={
            showQuarterUi
              ? (quarterVideos[ytTargetQuarter]
                  ? `${ytTargetQuarter}쿼터 영상 교체 — 링크 붙여넣기`
                  : `${ytTargetQuarter}쿼터 영상 링크 붙여넣기`)
              : (selectedSlot.youtube_url ? '영상 교체 — 링크 붙여넣기' : '영상 링크 붙여넣기')
          }
          className="flex-1 min-w-[180px] px-2.5 py-1.5 text-xs min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', color: 'var(--mm-ink)', borderRadius: '4px' }}
        />
        <button
          type="button"
          onClick={() => attachVideo(ytInput)}
          disabled={ytSaving || ytInput.trim().length === 0}
          className="inline-flex items-center gap-1.5 shrink-0 cursor-pointer text-xs font-bold px-3 py-1.5 min-h-[44px] transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', borderRadius: '4px' }}
        >
          {ytSaving
            ? <Loader2 size={14} className="animate-spin" aria-hidden />
            : <Link2 size={14} strokeWidth={2.5} aria-hidden />}
          연동
        </button>
        <button
          type="button"
          onClick={loadYoutubeList}
          disabled={ytListLoading}
          title="이 날짜에 올라온 채널 영상을 목록으로 불러와 고릅니다"
          className="inline-flex items-center gap-1.5 shrink-0 cursor-pointer text-xs font-bold px-2.5 py-1.5 min-h-[44px] transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          style={{ background: 'var(--mm-panel-alt)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)', borderRadius: '4px' }}
        >
          {ytListLoading
            ? <Loader2 size={14} className="animate-spin" aria-hidden />
            : <Search size={14} strokeWidth={2.5} aria-hidden />}
          목록에서 고르기
        </button>
      </div>

      {showQuarterUi && (
        <p className="mt-1.5 text-xs leading-relaxed" style={{ color: 'var(--mm-muted)' }}>
          {/* 조사는 강조 태그 안에 붙인다 — 밖에 두면 "1쿼터 에" 로 한 칸 벌어진다 */}
          고른 영상은 위에서 선택한 <strong style={{ color: 'var(--mm-ink-soft)' }}>{ytTargetQuarter}쿼터에</strong> 연결됩니다.
        </p>
      )}

      {/* 이 날짜 영상 목록 — 제목을 그대로 보여준다. 번호를 추측하지 않는 게 핵심이다.
          이미 다른 슬롯에 붙은 영상은 어디에 붙었는지 표시해 중복 배정을 막는다. */}
      {ytPickerOpen && ytList.length > 0 && (
        <ul
          className="mt-2 list-none p-0 m-0 overflow-y-auto max-h-[260px]"
          style={{ border: '1px solid var(--mm-rule)', borderRadius: '4px', background: 'var(--mm-panel-alt)' }}
        >
          {ytList.map(v => {
            // 이 경기의 쿼터 칸들과 먼저 대조한다 — 슬롯 대표 영상만 보면 2~4쿼터에
            //   이미 붙은 영상이 "안 붙음"으로 보여 같은 영상을 두 번 붙이게 된다.
            const usedQuarter = [1, 2, 3, 4, 5, 6].find(q => quarterVideos[q]?.url.includes(v.video_id)) ?? null
            // 다른 슬롯에 붙었는지는 그 슬롯의 **대표 영상**으로만 알 수 있다
            //   (다른 경기의 쿼터 표까지 읽지는 않는다 — 대표는 가장 이른 쿼터라 대개 1쿼터가 잡힌다).
            const usedBy = usedQuarter
              ? null
              : slots.find(sl => sl.id !== selectedSlot.id && sl.youtube_url?.includes(v.video_id))
            const isThis = usedQuarter === ytTargetQuarter
            return (
              <li key={v.video_id} style={{ borderBottom: '1px solid var(--mm-rule)' }}>
                <button
                  type="button"
                  onClick={() => attachVideo(v.url)}
                  disabled={ytSaving || isThis}
                  className="w-full text-left flex items-center gap-2.5 px-2.5 py-2 min-h-[44px] cursor-pointer transition-colors duration-200 hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                >
                  {v.thumbnail && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={v.thumbnail} alt="" className="w-14 h-10 object-cover shrink-0 opacity-80" style={{ borderRadius: '3px' }} />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs leading-snug" style={{ color: 'var(--mm-ink)' }}>{v.title}</span>
                    {(usedBy || usedQuarter) && (
                      <span className="block text-xs mt-0.5" style={{ color: 'var(--mm-muted)' }}>
                        {usedQuarter
                          ? (isThis ? `지금 이 ${usedQuarter}쿼터에 연결됨` : `${usedQuarter}쿼터에 연결됨`)
                          : isThis ? '지금 이 슬롯에 연결됨' : `${usedBy!.slot_num}경기에 연결됨`}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      </div>
    </details>
  )
}
