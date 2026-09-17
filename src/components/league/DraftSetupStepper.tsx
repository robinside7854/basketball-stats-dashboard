'use client'
// 「드래프트 준비」 스테퍼 — ① 분기 ② 코드 ③ 세션 ④ 링크.
//
// 왜 이 컴포넌트가 생겼나 (2026-09-18 실측):
//   리그 페이지 편집 모드는 390px 에서 3243px(3.84화면)짜리 평면 나열이었다. 코드 발급과
//   세션 생성 사이를 오가려면 매번 3화면을 스크롤해야 했고, "지금 어디까지 했는지"를
//   화면이 말해 주지 않았다. 끝난 칸은 한 줄로 접고 지금 할 칸만 연다.
//
// 진행(준비 체크·추첨·시작)은 여기 없다 — 그건 총무가 포털(/draft/<token>)에서 한다.
// 이 화면의 결승선은 ④ 링크 복사다.
//
// 로직은 전부 기존 컴포넌트(DraftCodeManager · DraftSessionControl)가 그대로 들고 있다.
// 이 파일은 "어느 칸에 무엇을 넣고 언제 접을지"만 정한다.

import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { Check, ChevronDown, AlertTriangle, ArrowUp } from 'lucide-react'
import DraftCodeManager from './DraftCodeManager'
import DraftSessionControl from './DraftSessionControl'
import NextQuarterButton from './NextQuarterButton'
import type { Quarter } from '@/types/league'

interface Team { id: string; name: string; color: string }

interface DraftCodeRow {
  role: 'manager' | 'supervisor'
  team_id: string | null
  is_active: boolean
}

interface Props {
  leagueId: string
  quarters: Quarter[]
  selectedQid: string | null
  teams: Team[]
  /** 인증 헤더 — 어드민은 {} (쿠키), 리그 페이지는 X-League-Pin */
  authHeaders?: Record<string, string>
  /** 분기 추가 성공 후 — 부모가 목록을 다시 읽고 새 분기를 고른다 */
  onQuarterCreated: (newQuarterId: string) => void
  /** 팀명·색상이 바뀌었을 때 부모가 팀 목록을 다시 읽도록 */
  onTeamsChanged?: () => void
  /** 세션이 바뀌었을 때(생성·삭제·저장) 부모 갱신 */
  onSessionChanged?: () => void
}

type StepId = 1 | 2 | 3 | 4

export default function DraftSetupStepper({
  leagueId,
  quarters,
  selectedQid,
  teams,
  authHeaders = {},
  onQuarterCreated,
  onTeamsChanged,
  onSessionChanged,
}: Props) {
  // 사용자가 직접 연 칸. null 이면 "가장 먼저 안 끝난 칸"을 연다.
  const [openStep, setOpenStep] = useState<StepId | null>(null)
  const [codes, setCodes] = useState<DraftCodeRow[]>([])
  const [hasSession, setHasSession] = useState<boolean | null>(null)
  const [hasLink, setHasLink] = useState(false)

  // ④ 칸의 체크리스트("총무 코드 1개 이상")와 ③ 완료 판정에 쓰는 값만 읽는다.
  // 화면을 그리는 건 자식 컴포넌트들이고, 여기는 접기/펼치기 판단에만 쓴다.
  const refresh = useCallback(async () => {
    if (!selectedQid) return
    const [cRes, dRes] = await Promise.all([
      fetch(`/api/admin/leagues/${leagueId}/draft-codes?quarterId=${selectedQid}`, { headers: authHeaders }).catch(() => null),
      fetch(`/api/admin/leagues/${leagueId}/drafts?quarterId=${selectedQid}`, { headers: authHeaders }).catch(() => null),
    ])
    const list = cRes?.ok ? await cRes.json().catch(() => []) : []
    setCodes(Array.isArray(list) ? list : [])
    if (dRes?.ok) {
      const d = await dRes.json().catch(() => ({}))
      setHasSession(!!d.draft)
      setHasLink(!!d.draft?.share_token)
    } else {
      setHasSession(false)
      setHasLink(false)
    }
  // authHeaders 는 매 렌더 새 객체라 deps 에 넣으면 무한 루프가 된다
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, selectedQid])

  useEffect(() => { void refresh() }, [refresh])

  // 분기를 바꾸면 "어디까지 했는지"가 달라진다 → 사용자가 열어둔 칸을 놓아준다
  useEffect(() => { setOpenStep(null) }, [selectedQid])

  const activeCodes = codes.filter(c => c.is_active)
  const managerCount = activeCodes.filter(c => c.role === 'manager' && c.team_id).length
  const supervisorCount = activeCodes.filter(c => c.role === 'supervisor').length
  const quarter = quarters.find(q => q.id === selectedQid)
  const quarterLabel = quarter ? `${String(quarter.year).slice(2)}.${quarter.quarter}Q` : null

  const done: Record<StepId, boolean> = {
    1: !!selectedQid,
    2: managerCount >= teams.length && teams.length > 0 && supervisorCount >= 1,
    3: hasSession === true,
    4: hasLink,
  }

  // 지금 열려야 할 칸 — 사용자가 고른 게 있으면 그것, 없으면 첫 미완료 칸
  const firstOpen: StepId = ([1, 2, 3, 4] as StepId[]).find(n => !done[n]) ?? 4
  const current = openStep ?? firstOpen

  const summary: Record<StepId, string> = {
    1: quarterLabel ? `${quarterLabel} 선택됨` : '분기를 고르세요',
    2: `단장 ${managerCount}/${teams.length} · 총무 ${supervisorCount}`,
    3: hasSession === null ? '확인 중' : hasSession ? '세션 준비됨' : '세션 없음',
    4: hasLink ? '링크 발급됨' : '링크 없음',
  }

  const steps: { id: StepId; title: string; body: ReactNode }[] = [
    {
      id: 1,
      title: '분기',
      body: (
        <div className="space-y-3">
          <p className="text-base text-[var(--mm-ink-soft)] leading-relaxed break-keep">
            드래프트를 할 분기를 위 탭에서 고르세요. 다음 분기가 아직 없다면 여기서 만듭니다.
          </p>
          <NextQuarterButton
            leagueId={leagueId}
            quarters={quarters}
            authHeaders={authHeaders}
            onCreated={onQuarterCreated}
          />
        </div>
      ),
    },
    {
      id: 2,
      title: '코드',
      body: selectedQid ? (
        <div className="space-y-3">
          <p className="text-base text-[var(--mm-ink-soft)] leading-relaxed break-keep">
            팀마다 단장 코드를 하나씩, 그리고 당일 진행을 맡을 총무 코드를 하나 발급하세요.
            발급한 코드는 카드에 그대로 보이니 복사해서 각자에게 보내면 됩니다.
          </p>
          <DraftCodeManager
            leagueId={leagueId}
            quarterId={selectedQid}
            teams={teams}
            authHeaders={authHeaders}
            onTeamsChanged={() => { onTeamsChanged?.(); void refresh() }}
          />
        </div>
      ) : null,
    },
    {
      id: 3,
      title: '세션',
      body: selectedQid ? (
        <div className="space-y-3">
          <p className="text-base text-[var(--mm-ink-soft)] leading-relaxed break-keep">
            팀장과 드래프트에 참여할 선수를 정합니다. ②에서 단장 코드를 발급했다면 팀장은 자동으로 채워집니다.
          </p>
          <DraftSessionControl
            leagueId={leagueId}
            quarterId={selectedQid}
            teams={teams}
            authHeaders={authHeaders}
            section="editor"
            onChanged={() => { onSessionChanged?.(); void refresh() }}
          />
        </div>
      ) : null,
    },
    {
      id: 4,
      title: '링크',
      body: selectedQid ? (
        <div className="space-y-3">
          <DraftSessionControl
            leagueId={leagueId}
            quarterId={selectedQid}
            teams={teams}
            authHeaders={authHeaders}
            section="share"
            onChanged={() => { onSessionChanged?.(); void refresh() }}
          />
          {/* 진행 권한 체크 — 총무 코드가 없으면 링크를 뿌려도 아무도 드래프트를 시작할 수 없다 */}
          <div className={`rounded-lg border p-3 space-y-2 ${
            supervisorCount >= 1
              ? 'border-[var(--mm-rule)] bg-[var(--mm-panel-alt)]'
              : 'border-[var(--mm-negative)]/40 bg-[var(--mm-negative-bg)]'
          }`}>
            <p className={`text-base font-bold flex items-center gap-2 ${
              supervisorCount >= 1 ? 'text-[var(--mm-positive-fg)]' : 'text-[var(--mm-negative)]'
            }`}>
              {supervisorCount >= 1
                ? <><Check size={18} className="shrink-0" aria-hidden /> 총무 코드 {supervisorCount}개 발급됨</>
                : <><AlertTriangle size={18} className="shrink-0" aria-hidden /> 총무 코드가 없습니다</>}
            </p>
            {supervisorCount >= 1 ? (
              <p className="text-base text-[var(--mm-ink-soft)] leading-relaxed break-keep">
                링크를 단톡방에 보내세요. 준비·추첨·시작은 총무가 이 링크로 들어가 총무 코드로 진행합니다.
              </p>
            ) : (
              <>
                <p className="text-base text-[var(--mm-ink-soft)] leading-relaxed break-keep">
                  링크를 보내도 드래프트를 시작할 사람이 없습니다. ②에서 총무 코드를 하나 발급하세요.
                </p>
                <button
                  type="button"
                  onClick={() => setOpenStep(2)}
                  className="inline-flex items-center gap-1.5 px-3.5 min-h-11 rounded-md border border-[var(--mm-negative)]/50 bg-[var(--mm-panel)] text-[var(--mm-negative)] text-base font-bold cursor-pointer transition-colors duration-200 hover:border-[var(--mm-negative)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mm-negative)]"
                >
                  <ArrowUp size={16} aria-hidden /> ② 코드로 가기
                </button>
              </>
            )}
          </div>
        </div>
      ) : null,
    },
  ]

  return (
    <div className="lg:grid lg:grid-cols-[280px_1fr] lg:gap-6 lg:items-start">
      {/* PC 좌측 레일 — 어느 칸까지 왔는지 한눈에. 모바일에서는 각 칸 헤더가 그 역할을 한다. */}
      <nav aria-label="드래프트 준비 단계" className="hidden lg:block sticky top-4 space-y-1.5">
        {steps.map(s => {
          const isCurrent = current === s.id
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setOpenStep(s.id)}
              aria-current={isCurrent ? 'step' : undefined}
              className={`w-full flex items-center gap-3 px-3.5 min-h-14 rounded-lg border text-left cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mm-yellow-strong)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--mm-ground)] ${
                isCurrent
                  ? 'border-[var(--mm-yellow-strong)] bg-[var(--mm-yellow-soft)]'
                  : 'border-[var(--mm-rule)] bg-[var(--mm-panel-alt)] hover:border-[var(--mm-ink-soft)]'
              }`}
            >
              <StepBadge n={s.id} done={done[s.id]} current={isCurrent} />
              <span className="min-w-0 flex-1">
                <span className="block text-base font-bold text-[var(--mm-ink)]">{s.title}</span>
                <span className="block text-sm text-[var(--mm-ink-soft)] truncate">{summary[s.id]}</span>
              </span>
            </button>
          )
        })}
      </nav>

      <div className="space-y-2.5 min-w-0">
        {steps.map(s => {
          const isOpen = current === s.id
          return (
            <section key={s.id} className="border border-[var(--mm-rule)] rounded-xl overflow-hidden bg-[var(--mm-panel)]">
              <h3>
                <button
                  type="button"
                  onClick={() => setOpenStep(isOpen ? null : s.id)}
                  aria-expanded={isOpen}
                  className={`w-full flex items-center gap-3 px-4 min-h-14 text-left cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mm-yellow-strong)] focus-visible:ring-inset ${
                    isOpen ? 'bg-[var(--mm-yellow-soft)]' : 'bg-[var(--mm-panel-alt)] hover:bg-[var(--mm-yellow-soft)]'
                  }`}
                >
                  <StepBadge n={s.id} done={done[s.id]} current={isOpen} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-bold text-[var(--mm-ink)]">{s.title}</span>
                    {!isOpen && (
                      <span className="block text-sm text-[var(--mm-ink-soft)] truncate">{summary[s.id]}</span>
                    )}
                  </span>
                  <span className="shrink-0 flex items-center gap-1.5 text-sm font-bold text-[var(--mm-ink-soft)]">
                    {isOpen ? '접기' : '펼치기'}
                    <ChevronDown size={16} aria-hidden className={isOpen ? 'rotate-180 transition-transform duration-200' : 'transition-transform duration-200'} />
                  </span>
                </button>
              </h3>
              {isOpen && <div className="p-4 border-t border-[var(--mm-rule)]">{s.body}</div>}
            </section>
          )
        })}
      </div>
    </div>
  )
}

/** 단계 번호 원형 배지 — 끝난 칸은 체크, 지금 칸은 노랑, 나머지는 회색. 색만으로 구분하지 않는다. */
function StepBadge({ n, done, current }: { n: number; done: boolean; current: boolean }) {
  return (
    <span
      aria-hidden
      className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-base font-black tabular-nums border ${
        done
          ? 'bg-[var(--mm-positive-bg)] border-[var(--mm-positive)]/50 text-[var(--mm-positive-fg)]'
          : current
            ? 'bg-[var(--mm-yellow)] border-[var(--mm-yellow-strong)] text-[var(--mm-black)]'
            : 'bg-[var(--mm-panel)] border-[var(--mm-rule)] text-[var(--mm-muted)]'
      }`}
    >
      {done ? <Check size={18} /> : n}
    </span>
  )
}
