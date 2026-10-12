import { toast } from 'sonner'
import { YT_RULE_LABEL } from '../_lib/constants'
import { extractVideoId } from '../_lib/video'
import type { GameSlot, YtTitleRule } from '../_lib/types'
import type { RecordState } from './useRecordState'

// ── 영상 연동 동작 ───────────────────────────────────────────────────
//   링크 붙이기(쿼터 칸) · 쿼터 영상 해제 · 날짜 영상 목록 · 대표 영상 제거 · YouTube 자동 연동(규칙 재시도·칸 늘리기).
//   훅을 쓰지 않는다 — 분리 전처럼 매 렌더 새로 만들어지는 함수다.
export type UseVideoActionsCtx = Pick<RecordState,
  'leagueYtChannel' | 'selectedDate' | 'selectedSlotId' | 'setSlots' | 'setYtInput' | 'setYtList' | 'setYtListLoading' | 'setYtPickerOpen' | 'setYtSaving' | 'setYtSyncing' | 'ytList' | 'ytTargetQuarter'
> & {
  autoFillRotation: (fresh: GameSlot[], opts?: { onlyEmpty?: boolean }) => Promise<void>
  leagueHeaders: Record<string, string>
  leagueId: string
  loadQuarterVideos: (gameId: string | null) => Promise<void>
  refreshSlots: () => Promise<GameSlot[] | null>
  selectedSlot: GameSlot | null
}

export function useVideoActions(ctx: UseVideoActionsCtx) {
  const { leagueYtChannel, selectedDate, selectedSlotId, setSlots, setYtInput, setYtList,
    setYtListLoading, setYtPickerOpen, setYtSaving, setYtSyncing, ytList, ytTargetQuarter,
    autoFillRotation, leagueHeaders, leagueId, loadQuarterVideos, refreshSlots, selectedSlot } = ctx
  // 링크 입력·목록 고르기의 단일 입구 — 항상 **고른 쿼터 칸**에 붙인다.
  //   호출부 세 곳(입력 Enter · 연동 버튼 · 목록 항목)이 각자 분기하면 하나를 빠뜨렸을 때
  //   그 경로로만 영상이 엉뚱한 자리에 덮어써진다.
  //
  //   2026-09-07 이전에는 리그에서 경기 대표 자리(league_games.youtube_url)에 직접 붙였다.
  //   미라클이 쿼터제로 바뀌면서 리그도 촬영본이 쿼터로 쪼개져 올라온다 — 한 칸으로는 담기지 않는다.
  //   쿼터 칸에 저장하면 서버가 대표 영상(가장 이른 쿼터)까지 함께 맞춰 주므로,
  //   `.not('youtube_url','is',null)` 로 "영상 있는 경기"를 고르는 하이라이트 로더들도 그대로 돈다.
  function attachVideo(raw: string) {
    return saveQuarterVideo(ytTargetQuarter, raw)
  }

  async function saveQuarterVideo(quarter: number, raw: string) {
    if (!selectedSlotId) return
    const id = extractVideoId(raw)
    if (!id) {
      toast.error('YouTube 링크를 인식하지 못했습니다', {
        description: 'youtube.com/watch?v=… · youtu.be/… 또는 영상 ID 11자리를 넣으세요',
        duration: 6000,
      })
      return
    }
    setYtSaving(true)
    try {
      const res = await fetch(`/api/leagues/${leagueId}/games/${selectedSlotId}/videos`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...leagueHeaders },
        body: JSON.stringify({ quarter, youtube_url: `https://www.youtube.com/watch?v=${id}` }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error(body.error ?? `영상 연동 실패 (${res.status})`, { duration: 6000 })
        return
      }
      setYtInput('')
      setYtPickerOpen(false)
      await loadQuarterVideos(selectedSlotId)
      // 대표 영상(league_games.youtube_url)이 서버에서 함께 바뀌므로 슬롯도 다시 읽는다.
      await refreshSlots()
      toast.success(`${quarter}쿼터 영상 연동됨`)
    } finally {
      setYtSaving(false)
    }
  }

  async function clearQuarterVideo(quarter: number) {
    if (!selectedSlotId) return
    if (!confirm(`${quarter}쿼터 영상 연결을 해제하시겠습니까?\n\n· 기록한 내용은 지워지지 않습니다\n· 다시 연결하면 그대로 재생됩니다`)) return
    const res = await fetch(`/api/leagues/${leagueId}/games/${selectedSlotId}/videos?quarter=${quarter}`, {
      method: 'DELETE',
      headers: leagueHeaders,
    })
    if (res.ok) {
      await loadQuarterVideos(selectedSlotId)
      await refreshSlots()
      toast.success(`${quarter}쿼터 영상 해제됨`)
    } else {
      const body = await res.json().catch(() => ({}))
      toast.error(body.error ?? '해제 실패')
    }
  }

  // 이 날짜에 올라온 채널 영상 목록 — 제목을 눈으로 보고 고른다(번호 추측 없음).
  async function loadYoutubeList() {
    if (!selectedDate) { toast.error('날짜를 먼저 선택하세요'); return }
    setYtPickerOpen(true)
    if (ytList.length > 0) return
    setYtListLoading(true)
    try {
      const res = await fetch(`/api/leagues/${leagueId}/youtube-videos?date=${selectedDate}`, {
        headers: leagueHeaders,
        cache: 'no-store',
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body.error ?? `영상 목록을 불러오지 못했습니다 (${res.status})`, { duration: 6000 })
        setYtPickerOpen(false)
        return
      }
      setYtList(body.videos ?? [])
      if ((body.videos ?? []).length === 0) toast('이 날짜에 올라온 영상이 없습니다')
    } finally {
      setYtListLoading(false)
    }
  }

  // 선택된 슬롯의 YouTube URL 제거 (잘못 매핑된 영상 수동 정리용)
  async function clearYoutubeUrl() {
    if (!selectedSlotId || !selectedSlot) return
    if (!selectedSlot.youtube_url) return
    if (!confirm('이 슬롯의 YouTube 영상 링크를 제거하시겠습니까?\n\n· 잘못 매핑된 영상을 정리할 때 사용\n· 다시 붙이려면 날짜 옆 「YouTube 연동」 버튼을 누르거나 링크를 직접 넣으세요')) return
    const res = await fetch(`/api/leagues/${leagueId}/games?gameId=${selectedSlotId}`, {
      method: 'PATCH',
      headers: leagueHeaders,
      body: JSON.stringify({ youtube_url: null, youtube_start_offset: 0 }),
    })
    if (res.ok) {
      toast.success('YouTube 영상 링크 제거됨')
      await refreshSlots()
    } else {
      toast.error('제거 실패')
    }
  }

  // 이 날짜에 슬롯을 n 칸 덧붙인 뒤 다시 연동한다.
  //   영상 연동은 **슬롯을 만들지 않는다**(2026-08-22 사고 — 그렇게 생긴 칸은 is_exhibition 이
  //   기본값 false 라 친선 날짜에 정규전 칸이 끼었다). 그래서 칸을 늘리는 일은 사람이 누르는
  //   이 경로(`addSlot: true`, 그 날짜의 친선 여부를 상속)로만 한다.
  async function growSlotsAndResync(count: number, titleRule?: YtTitleRule) {
    if (!selectedDate || count < 1) return
    setYtSyncing(true)
    try {
      for (let i = 0; i < count; i++) {
        const res = await fetch(`/api/leagues/${leagueId}/games`, {
          method: 'POST',
          headers: leagueHeaders,
          body: JSON.stringify({ date: selectedDate, addSlot: true }),
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) {
          toast.error(body.error ?? `슬롯 추가 실패 (${res.status})`, { duration: 6000 })
          return
        }
        if (body.slots) setSlots(body.slots)
      }
    } catch (e) {
      toast.error(`슬롯 추가 실패: ${e instanceof Error ? e.message : '알 수 없는 오류'}`)
      return
    } finally {
      setYtSyncing(false)
    }
    await syncYoutube(titleRule)
  }

  /**
   * YouTube 자동 연동.
   *
   * 제목 규칙이 **두 가지**이고 업로더의 습관이 날마다 다르다 —
   *   `260919 경기1`(경기 번호 → 그날 1번 슬롯) · `260905 지피티vs빅현욱 1Q`(대진 + 쿼터).
   * 기본값은 서버의 자동 판정('auto')이고, 어긋났을 때 토스트의 버튼으로 다른 규칙을 골라
   * 다시 돌릴 수 있다. `titleRule` 이 그 재시도용 인자다.
   */
  async function syncYoutube(titleRule?: YtTitleRule) {
    if (!leagueYtChannel) { toast.error('설정 탭에서 YouTube 채널을 먼저 지정하세요'); return }
    if (!selectedDate) { toast.error('날짜를 먼저 선택하세요'); return }
    setYtSyncing(true)
    try {
      const res = await fetch(`/api/leagues/${leagueId}/youtube-sync`, {
        method: 'POST',
        headers: { ...leagueHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelHandle: leagueYtChannel,
          date: selectedDate,
          ...(titleRule ? { titleRule } : {}),
        }),
      })
      let data: Record<string, unknown> = {}
      try { data = await res.json() } catch { /* non-JSON response */ }

      // 어느 규칙으로 읽었고, 다른 규칙이면 몇 개가 읽히는가.
      //   규칙이 둘이라는 사실을 운영자가 알 수 있어야 "왜 안 붙었지"에서 멈추지 않는다.
      const counts = (data.rule_counts as { quarter?: number; legacy?: number } | undefined) ?? {}
      const usedRule: YtTitleRule | null =
        data.mode === 'quarter' || data.mode === 'legacy' ? data.mode
        : titleRule ?? null
      const otherRule: YtTitleRule | null =
        usedRule === 'quarter' ? 'legacy'
        : usedRule === 'legacy' ? 'quarter'
        : (counts.legacy ?? 0) > 0 ? 'legacy'
        : (counts.quarter ?? 0) > 0 ? 'quarter'
        : null
      const otherCount = otherRule ? (counts[otherRule] ?? 0) : 0
      const needSlots = Number(data.need_slots ?? 0)

      // 버튼은 하나만 둔다 — 칸이 모자란 것이 더 구체적인 원인이므로 그쪽을 먼저 권한다.
      const retryAction =
        needSlots > 0
          ? {
              label: `칸 ${needSlots}개 늘리고 다시 연동`,
              onClick: () => { void growSlotsAndResync(needSlots, titleRule) },
            }
          : otherRule && otherCount > 0
          ? {
              label: `'${YT_RULE_LABEL[otherRule]}' 규칙으로 다시 연동`,
              onClick: () => { void syncYoutube(otherRule) },
            }
          : undefined

      if (res.ok) {
        // 부분 성공을 성공이라고 말하지 않는다 (2026-09-17).
        //   9/12 에 영상 9개 중 3개만 붙었는데 `3개 연동 완료` 만 떠서, 나머지 6개가 빠진 것을
        //   사람이 재생목록을 눈으로 세어 보고서야 알았다. 못 붙인 것이 있으면 그 수와 사유를
        //   같은 자리에서 보여준다 — 조치(팀 별칭 등록)가 사유 안에 들어 있다.
        const skipped = Number(data.skipped ?? 0)
        const reasons = (data.skipped_reasons as string[] | undefined) ?? []
        const ruleNote = usedRule ? `'${YT_RULE_LABEL[usedRule]}' 규칙` : ''
        if (skipped > 0) {
          toast.warning(`영상 ${data.total_videos}개 중 ${data.mapped}개만 연동됨 · ${skipped}개 실패`, {
            description: [ruleNote ? `${ruleNote}으로 읽었습니다` : '', ...reasons.slice(0, 3)]
              .filter(Boolean).join('\n'),
            duration: 12000,
            action: retryAction,
          })
        } else {
          // 이미 영상이 붙은 경기는 서버가 덮어쓰지 않는다(kept) — 그 수를 함께 알린다.
          const kept = ((data.details as { action: string }[] | undefined) ?? []).filter(d => d.action.startsWith('kept')).length
          toast.success(
            `${data.mapped}개 영상 새로 연동${kept > 0 ? ` · ${kept}개는 이미 붙어 있어 그대로 둠` : ''}`,
            { description: ruleNote ? `${ruleNote}으로 읽었습니다` : undefined },
          )
        }
        // 연동이 칸을 새로 늘렸으면(예: 4~9경기) 그 빈 칸에도 대진을 채운다
        const fresh = await refreshSlots()
        if (fresh) await autoFillRotation(fresh, { onlyEmpty: true })
      } else {
        const msg = (data.error as string) ?? `YouTube 연동 실패 (${res.status})`
        toast.error(msg, { duration: 10000, action: retryAction })
      }
    } catch (e) {
      toast.error(`네트워크 오류: ${e instanceof Error ? e.message : '알 수 없는 오류'}`, { duration: 6000 })
    } finally {
      setYtSyncing(false)
    }
  }

  return { attachVideo, clearQuarterVideo, loadYoutubeList, clearYoutubeUrl, syncYoutube }
}
