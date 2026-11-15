// 시험 계정(2026-11-15 CEO) — 운영진이 일반 회원 화면을 시험하려고 만든 계정.
//   teams.settings.test_player_ids 에 든 선수는 월렛에서 무료로 충전하고(통장 입금 없이 바로 잔액),
//   그 충전은 회원 내역·어드민 회원별 잔액·처리 내역 어디에도 보이지 않는다.
//   ⚠ 잔액은 그대로 wallet_apply 로만 바꾼다(장부 행은 남는다 — 화면에서만 숨김).
import { loadClub } from '@/lib/club/settings'

export const TEST_FREE_MEMO = '시험 계정 무료 충전'

export async function testPlayerIds(teamId: string): Promise<Set<string>> {
  const club = await loadClub(teamId).catch(() => null)
  return new Set(club?.settings.test_player_ids ?? [])
}
