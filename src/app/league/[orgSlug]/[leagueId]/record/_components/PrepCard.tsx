import type React from 'react'
import { ArrowLeftRight, Loader2 } from 'lucide-react'
import type { GameSlot, Setter } from '../_lib/types'

// ── 기록 준비 ─────────────────────────────────────────────────────────
//   경기를 시작하기 전에 정할 것만 남긴 카드 (2026-09-07 재구성).
//   종전에는 셀렉트 2개 + 버튼 6개가 한 줄에 섞여 있었고, 그 아래로 영상 패널과
//   +1 설정이 **항상 펼쳐진 채** 513줄을 차지했다. 실측(리그 282경기): 영상은 100%
//   자동으로 붙고, 경기한정 +1 은 4%, 쿼터별 +1 은 0% 에서만 쓰였다.
//   → 매 경기 정하는 것(종류·팀)만 펼쳐 두고 나머지는 접는다. 기능은 그대로 있다.
//   ①경기 종류 ②팀 은 여기서 그리고, ③영상 ④고급 ⑤임시팀(친선전) 은 각각의 패널 컴포넌트를
//   받아 같은 자리에 꽂는다 — 화면 구조는 분리 전(2026-10-12 리뉴얼 6단계)과 같다.
export default function PrepCard({
  selectedSlot, isTournament, gameStarted, teamOptions,
  pendingHome, pendingAway, setPendingHome, setPendingAway,
  saveTeams, savingTeam, swapSides, swappingId, toggleExhibition,
  videoPanel, advancedPanel, adhocPanel,
}: {
  selectedSlot: GameSlot
  isTournament: boolean
  gameStarted: boolean
  teamOptions: { id: string; name: string }[]
  pendingHome: string
  pendingAway: string
  setPendingHome: Setter<string>
  setPendingAway: Setter<string>
  saveTeams: () => Promise<void>
  savingTeam: boolean
  swapSides: (slotId: string) => Promise<void>
  swappingId: string | null
  toggleExhibition: () => Promise<void>
  videoPanel: React.ReactNode
  advancedPanel: React.ReactNode
  adhocPanel: React.ReactNode
}) {
  return (
    <div
      className="p-3 mb-4 space-y-3"
      style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', borderRadius: '4px' }}
    >
      {/* 1행 — 이 경기가 무엇인가.
          종전엔 「친선전으로 표시」 버튼 하나가 다른 버튼 다섯 개 사이에 섞여 있었다.
          잘못 눌리면 그 경기가 리그 순위·개인 스탯에서 통째로 빠지는데도, 지금 어느
          상태인지는 노란 배지 하나로만 알 수 있었다. 상태를 먼저 보여주고 고르게 한다. */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="t-label shrink-0" style={{ color: 'var(--mm-muted)' }}>
          경기 {selectedSlot.slot_num}
        </span>
        {isTournament ? (
          /* 대회 경기는 정의상 공식전이다 — 고를 것이 없으므로 버튼을 두지 않는다.
             (친선으로 표시하면 집계 15곳이 전부 걸러내 그 대회 스탯이 통째로 빈다) */
          <span
            className="text-xs font-bold px-2 min-h-11 inline-flex items-center"
            style={{ background: 'var(--mm-panel-alt)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)', borderRadius: '4px' }}
          >
            대회 경기
          </span>
        ) : (
          <div className="inline-flex" role="group" aria-label="경기 종류">
            {([
              { ex: false, label: '정규전', title: '리그 순위·개인 스탯에 집계됩니다' },
              { ex: true, label: '친선전', title: '리그 순위·개인 스탯에서 제외됩니다 (박스스코어·하이라이트에는 남습니다)' },
            ] as const).map((opt, i) => {
              const active = !!selectedSlot.is_exhibition === opt.ex
              return (
                <button
                  key={opt.label}
                  type="button"
                  /* 이미 그 상태면 아무 일도 하지 않는다 — toggleExhibition 은 토글이라
                     같은 값을 다시 누르면 반대로 뒤집힌다 */
                  onClick={() => { if (!active) toggleExhibition() }}
                  aria-pressed={active}
                  title={opt.title}
                  className="px-3 min-h-11 text-xs font-bold cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                  style={{
                    background: active ? 'var(--mm-yellow)' : 'var(--mm-panel-alt)',
                    color: active ? 'var(--mm-black)' : 'var(--mm-ink-soft)',
                    border: `1px solid ${active ? 'var(--mm-yellow)' : 'var(--mm-rule)'}`,
                    borderRadius: i === 0 ? '4px 0 0 4px' : '0 4px 4px 0',
                    marginLeft: i === 0 ? 0 : '-1px',
                  }}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        )}
        {selectedSlot.is_exhibition && (
          <span className="text-xs" style={{ color: 'var(--mm-muted)' }}>순위·개인 스탯에서 빠집니다</span>
        )}
      </div>

      {/* 2행 — 팀 */}
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={pendingHome}
          onChange={e => setPendingHome(e.target.value)}
          className="flex-1 px-2 py-1.5 text-xs cursor-pointer disabled:opacity-50 min-h-[44px]"
          style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', color: 'var(--mm-ink)', borderRadius: '4px' }}
        >
          <option value="">{selectedSlot.is_exhibition ? '홈 임시팀 선택' : '홈 팀 선택'}</option>
          {teamOptions.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        {/* 홈·원정 바꾸기 — 이 경기의 홈 팀과 원정 팀을 **저장값으로** 맞바꾼다(기록 시작 전만).
            아래 영상 칸의 「N쿼터 화면 좌우 반전」과는 다른 일이다 — 그쪽은 화면 배치만 뒤집는다.
            둘 다 ⇄ 아이콘이라 헷갈려서 2026-10-12 에 글자로 구분했다. */}
        <button
          onClick={() => swapSides(selectedSlot.id)}
          disabled={gameStarted || swappingId === selectedSlot.id || !selectedSlot.home_team_id || !selectedSlot.away_team_id}
          title="홈 팀과 원정 팀을 서로 바꿔 저장합니다 (기록 시작 전에만 가능)"
          aria-label="홈 팀과 원정 팀 바꾸기"
          className="shrink-0 inline-flex items-center justify-center gap-1 px-2 min-h-[44px] min-w-[44px] text-xs font-bold whitespace-nowrap cursor-pointer transition-colors disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', color: 'var(--mm-ink)', borderRadius: '4px' }}
        >
          {swappingId === selectedSlot.id
            ? <Loader2 size={14} className="animate-spin" aria-hidden />
            : <ArrowLeftRight size={14} aria-hidden />}
          홈↔원정
        </button>
        <select
          value={pendingAway}
          onChange={e => setPendingAway(e.target.value)}
          className="flex-1 px-2 py-1.5 text-xs cursor-pointer disabled:opacity-50 min-h-[44px]"
          style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', color: 'var(--mm-ink)', borderRadius: '4px' }}
        >
          <option value="">{selectedSlot.is_exhibition ? '어웨이 임시팀 선택' : '어웨이 팀 선택'}</option>
          {teamOptions.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        {/* 기록이 시작된 뒤에도 팀을 고칠 수 있어야 한다 — 잘못 지정한 채 마감하면
            지금까지는 되돌릴 방법이 아예 없었다. 기록은 서버가 함께 옮긴다. */}
        <button
          onClick={saveTeams}
          disabled={savingTeam}
          title={(selectedSlot.is_started || selectedSlot.is_complete)
            ? '팀을 바꾸고 이 경기 기록의 소속 팀도 함께 옮깁니다'
            : '이 경기의 홈·어웨이 팀 저장'}
          className="cursor-pointer shrink-0 text-xs font-bold px-3 py-1.5 disabled:opacity-50 transition-colors min-h-[44px]"
          style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', borderRadius: '4px' }}
        >
          {savingTeam
            ? <Loader2 size={14} className="animate-spin" />
            : (selectedSlot.is_started || selectedSlot.is_complete) ? '팀 교체' : '저장'}
        </button>
      </div>

      {videoPanel}

      {advancedPanel}

      {/* 친선전 안내 — 명단 기준이 평소와 다르다는 걸 화면에서 알 수 있어야 한다.
          안 밝히면 "왜 우리 팀 사람들이 명단에 없지?" 가 된다. */}
      {selectedSlot.is_exhibition && (
        <p
          className="mt-2 text-xs leading-relaxed"
          style={{ color: 'var(--mm-muted)' }}
        >
          <span className="font-bold" style={{ color: 'var(--mm-ink-soft)' }}>그날 짠 팀</span>
          {' — 친선전은 평소 소속 팀을 따르지 않습니다. 위 목록의 팀도, 아래에서 배정하는 선수도 이 날짜에만 쓰입니다. '}
          {'여기서 한 배정은 이 경기에만 적용되고 평소 팀 구성은 바뀌지 않습니다.'}
        </p>
      )}

      {/* 이 날짜 전용 임시팀 관리 — 친선전은 상시 3팀이 아니라 그날 짠 팀으로 한다.
          만든 팀은 이 날짜의 친선 슬롯에서만 보이고, 순위·명단·드래프트·일정에는 등장하지 않는다. */}
      {adhocPanel}
    </div>
  )
}
