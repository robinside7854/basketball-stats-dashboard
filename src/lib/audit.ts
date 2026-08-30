// 파괴적 운영 행위 공용 감사 로그 (2026-08-15) — 마이그레이션 106 과 한 쌍
//
// 왜 있는가
//   공동관리자가 둘 이상이 된 뒤로 "누가 미라클 3분기 기록을 날렸는지" 를 사후에 알
//   방법이 없었다. 리그 삭제·경기 초기화·이벤트 삭제는 되돌릴 수 없는데(리그 스탯은
//   league_game_events 재집계로만 만들어진다) 행위자가 어디에도 남지 않았다.
//
// 설계 원칙 세 가지
//   1) 기록 실패가 본래 작업을 막지 않는다.
//      이 파일의 함수는 **절대 throw 하지 않는다.** 로깅이 죽어서 삭제가 롤백되면
//      감사 장치가 장애 원인이 된다. 실패는 서버 콘솔에만 남긴다.
//   2) 마이그레이션 미적용 상태에서도 앱이 그대로 동작한다.
//      표가 없으면 첫 시도에서 감지해 경고 한 번만 찍고, 이후 요청은 조용히 건너뛴다
//      (매 요청 실패 왕복을 반복하지 않기 위해 모듈 단위 플래그로 기억한다).
//   3) 비밀값은 남기지 않는다.
//      PIN 원문 · 비밀번호 · 드래프트 코드 평문 · share_token 원문은 actor_id 에도
//      detail 에도 넣지 않는다. PIN 계열은 "PIN 으로 인증됐다" 는 사실과 그 PIN 이
//      속한 리그/팀만 남긴다.
//
// 행위자(actor) 를 왜 여기서 다시 판정하는가
//   라우트의 가드는 "통과했다/못 했다" 만 돌려주고 **누구였는지** 는 버린다
//   (canEditLeague · isDraftManager 전부 boolean). 그래서 드래프트 생성의
//   created_by 가 CEO 일 때만 채워지고 PIN·감독관 코드면 NULL 이 되는,
//   "기록이 있는 것처럼 보이지만 비어 있는" 형태가 만들어졌다.
//   여기서는 같은 순서로 다시 물어 종류까지 확정한다 — 파괴적 라우트에만 붙는
//   호출이라 조회 한두 번의 비용은 문제가 되지 않는다.
import { createClient } from '@/lib/supabase/admin'
import { requireCeoSession } from '@/lib/auth/ceo'
import { isBootstrapEmail } from '@/lib/auth/platformAdmin'
import { getLeagueAdminSession } from '@/lib/auth/leagueAdmin'
import { verifyLeaguePin } from '@/lib/leaguePinAuth'
import { lookupDraftCode } from '@/lib/leagueDraftAuth'

const TABLE = 'admin_audit_log'

/** 인증 경로의 종류 — 마이그레이션 106 의 CHECK 목록과 반드시 일치해야 한다. */
export type AuditActorKind =
  | 'ceo'              // 부트스트랩 소유자 계정(ADMIN_EMAIL)
  | 'platform_admin'   // 초대로 만들어진 공동관리자(platform_admins)
  | 'league_admin'     // 팀 어드민 회원 세션(league_user_accounts.role='admin')
  | 'league_pin'       // 리그 편집 PIN
  | 'manager_code'     // 드래프트 단장 코드
  | 'supervisor_code'  // 드래프트 감독관 코드
  | 'team_pin'         // 팀 편집 PIN (대회 전용 팀)
  | 'unknown'

/**
 * 기록되는 행위 목록. 유니온으로 고정하는 이유는 오타 방지다 —
 * 'league.delete' 와 'leagues.delete' 가 섞이면 사후 집계가 조용히 갈라진다.
 * 새 파괴적 라우트를 배선할 때 여기에 한 줄 추가한다.
 */
export type AuditAction =
  // 리그 · 팀
  | 'league.delete'
  | 'league.update'
  | 'league.edit_pin.update'
  | 'league.visibility.update'
  | 'league_team.delete'
  | 'team.delete'
  | 'team.update'
  // 경기 · 기록
  | 'game.reset'
  | 'game.delete'
  // 대회(파란날개) 기록기 — 마감 해제(비파괴)와 기록 전체 삭제(파괴)를
  // 반드시 다른 행위로 남긴다. 둘이 같은 버튼이었던 것이 2026-08-07·08-22 사고의 원인이다.
  | 'game.reopen'
  | 'game.records.clear'
  | 'game.records.restore'
  // 기록이 있는 경기의 팀 교체 — 이벤트·명단의 team_id 를 함께 옮기므로 흔적을 남긴다
  | 'game.reassign_teams'
  | 'event.update'
  | 'event.delete'
  | 'schedule.regenerate'
  | 'schedule_date.delete'
  // 대회(미라클 대회 묶음) — 대회 한 개와 그 경기는 리그 분기와 달리 화면에서 만들고 지운다.
  // 지우면 그 대회의 경기·기록이 함께 사라지는 경로라 흔적을 남긴다.
  | 'tournament.create'
  | 'tournament.delete'
  | 'tournament_game.create'
  // 명단
  | 'league_player.delete'
  | 'league_team_player.delete'
  | 'quarter_player.delete'
  // 권한
  | 'account.role.update'
  | 'account.status.update'
  | 'account.password.reset'
  | 'platform_admin.disabled.update'
  | 'platform_admin.invite.create'
  | 'platform_admin.invite.revoke'
  | 'platform_admin.password_reset_link.create'
  | 'platform_admin.password_reset_link.revoke'
  | 'platform_admin.password.reset'
  // 인증 실패 — 브루트포스는 "성공한 행위" 가 아니라 "실패의 연쇄" 로만 드러난다.
  | 'auth.league_pin.failed'
  // 드래프트
  | 'draft.create'
  | 'draft.delete'
  | 'draft.reset'
  | 'draft.share_token.rotate'
  | 'draft.share_token.revoke'
  | 'draft_code.create'
  | 'draft_code.update'
  | 'draft_code.delete'

export type AuditResult = 'success' | 'failure' | 'denied'

export interface AuditActor {
  kind: AuditActorKind
  id: string | null
  label: string
}

export interface AuditInput {
  /** 원 요청 — IP·경로·인증 헤더를 여기서 읽는다. */
  req: Request
  action: AuditAction
  /** 대상 테이블/식별자. 삭제된 대상도 가리킬 수 있어야 하므로 FK 가 아닌 값으로 남긴다. */
  targetTable?: string | null
  targetId?: string | null
  /** 조사 시작점. 대상이 이벤트·경기·팀이어도 소속 리그를 함께 남긴다. */
  leagueId?: string | null
  teamId?: string | null
  /**
   * 드래프트 코드 행위자를 단장/감독관까지 구분하려면 분기가 필요하다(코드가 분기 단위 발급).
   * 없으면 'supervisor_code' 로 뭉뚱그리지 않고 종류 판정만 한 단계 덜 정밀해진다.
   */
  quarterId?: string | null
  result?: AuditResult
  /** ⚠ 비밀값 금지 — 삭제된 행 수, 수정된 필드 '이름', 거절 사유 정도만. */
  detail?: Record<string, unknown> | null
}

// 마이그레이션 106 미적용 환경에서 매 요청 실패 왕복을 반복하지 않기 위한 기억.
// 서버 프로세스 단위라 배포·재시작이면 다시 한 번 시도한다(적용 직후 자동 복구).
let tableMissing = false

/** PostgREST/Postgres 가 "그런 표 없음" 을 알리는 형태들. 배포 환경마다 코드가 다르다. */
function isMissingTableError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  // 42P01 = undefined_table (Postgres) · PGRST205 = 스키마 캐시에 없음 (PostgREST)
  if (error.code === '42P01' || error.code === 'PGRST205') return true
  const msg = (error.message ?? '').toLowerCase()
  return msg.includes('could not find the table') || msg.includes('does not exist')
}

function clientIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    // 프록시 체인의 맨 앞이 원 클라이언트다.
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  return req.headers.get('x-real-ip')
}

function requestPath(req: Request): string | null {
  try {
    return new URL(req.url).pathname
  } catch {
    return null
  }
}

/** 표시용 리그 이름. 실패해도 로깅을 막지 않으므로 조용히 null. */
async function leagueName(leagueId: string): Promise<string | null> {
  try {
    const sb = createClient()
    const { data } = await sb.from('leagues').select('name').eq('id', leagueId).maybeSingle()
    return (data?.name as string) ?? null
  } catch {
    return null
  }
}

/**
 * 이 요청을 만든 행위자를 확정한다.
 *
 * 판정 순서는 실제 가드(canEditLeague · isDraftManager)와 같다 — 순서가 어긋나면
 * "CEO 로 로그인한 채 PIN 헤더도 들고 있는" 흔한 경우에 로그와 인가가 다른 답을 낸다.
 *
 * ⚠ 어떤 경우에도 throw 하지 않는다. 판정에 실패하면 'unknown' 이다.
 *   NULL 대신 'unknown' 을 쓰는 이유: "기록이 비었다" 와 "특정하지 못했다" 는 다른 사실이고,
 *   전자는 버그로 읽히지만 후자는 조사 대상으로 읽힌다.
 */
export async function resolveAuditActor(
  req: Request,
  scope: { leagueId?: string | null; quarterId?: string | null } = {},
): Promise<AuditActor> {
  const leagueId = scope.leagueId ?? null

  // 1) CEO / 공동관리자 (NextAuth). 부트스트랩 소유자와 초대 계정을 구분한다 —
  //    회수 가능한 계정인지 아닌지가 사후 대응에서 갈린다.
  try {
    const session = await requireCeoSession()
    const email = session?.user?.email
    if (typeof email === 'string' && email) {
      return isBootstrapEmail(email)
        ? { kind: 'ceo', id: email, label: `CEO ${email}` }
        : { kind: 'platform_admin', id: email, label: `공동관리자 ${email}` }
    }
  } catch {
    // 인증 판정 실패는 로깅을 멈출 이유가 아니다 — 아래 경로로 계속 내려간다.
  }

  // 2) 팀 어드민 회원 세션
  if (leagueId) {
    try {
      const admin = await getLeagueAdminSession(leagueId)
      if (admin) {
        return {
          kind: 'league_admin',
          id: admin.uid,
          label: `팀 어드민 ${admin.loginId}`,
        }
      }
    } catch {
      /* 계속 */
    }
  }

  // 3) 리그 편집 PIN — 여기가 기존에 NULL 로 사라지던 자리다.
  //    PIN 은 단톡방을 떠도는 4자리 공유 비밀이라 개인을 특정할 수 없다. 그래도
  //    "리그 X 의 PIN 으로 들어왔다" 는 사실은 남길 수 있고, 남겨야 한다.
  //    ⚠ PIN 값 자체는 저장하지 않는다.
  if (leagueId && req.headers.get('X-League-Pin')) {
    try {
      if (await verifyLeaguePin(req, leagueId)) {
        const name = await leagueName(leagueId)
        return {
          kind: 'league_pin',
          id: `league:${leagueId}`,
          label: `리그 PIN (${name ?? leagueId})`,
        }
      }
    } catch {
      /* 계속 */
    }
  }

  // 4) 드래프트 코드 (단장 / 감독관)
  //    분기를 알면 어떤 코드였는지까지 특정된다 — 코드 행(league_draft_codes.id)과
  //    레이블('총무' 등)만 남기고 평문 코드는 남기지 않는다.
  const draftCode = req.headers.get('X-Draft-Code')?.trim()
  if (draftCode) {
    if (leagueId && scope.quarterId) {
      try {
        const found = await lookupDraftCode(leagueId, scope.quarterId, draftCode)
        if (found) {
          return found.role === 'supervisor'
            ? { kind: 'supervisor_code', id: found.codeId, label: `드래프트 감독관 코드 (${found.label})` }
            : { kind: 'manager_code', id: found.codeId, label: `드래프트 단장 코드 (${found.label})` }
        }
      } catch {
        /* 계속 */
      }
    }
    // 분기를 모르면 코드 행까지는 못 짚는다. 종류만이라도 남긴다 —
    // 라우트가 이미 인가한 뒤이므로 유효한 코드였다는 사실은 확정이다.
    return {
      kind: 'supervisor_code',
      id: leagueId ? `league:${leagueId}` : null,
      label: '드래프트 코드 (분기 미상)',
    }
  }

  // 5) 팀 편집 PIN (대회 전용 팀 — 회원 계정 체계가 없는 경로)
  if (req.headers.get('X-Team-Pin')) {
    return { kind: 'team_pin', id: null, label: '팀 PIN' }
  }

  return { kind: 'unknown', id: null, label: '알 수 없음' }
}

/**
 * 감사 로그 한 줄 기록. **절대 throw 하지 않으며 본래 작업을 막지 않는다.**
 *
 * 사용 예 (라우트에서 성공 직후 한 줄):
 *   await logAudit({ req, action: 'game.reset', targetTable: 'league_games',
 *                    targetId: gameId, leagueId, detail: { deletedEvents: n } })
 */
export async function logAudit(input: AuditInput): Promise<void> {
  if (tableMissing) return

  try {
    const actor = await resolveAuditActor(input.req, {
      leagueId: input.leagueId,
      quarterId: input.quarterId,
    })

    const sb = createClient()
    const { error } = await sb.from(TABLE).insert({
      actor_kind: actor.kind,
      actor_id: actor.id,
      actor_label: actor.label,
      action: input.action,
      target_table: input.targetTable ?? null,
      target_id: input.targetId ?? null,
      league_id: input.leagueId ?? null,
      team_id: input.teamId ?? null,
      result: input.result ?? 'success',
      detail: input.detail ?? null,
      request_ip: clientIp(input.req),
      request_method: input.req.method ?? null,
      request_path: requestPath(input.req),
    })

    if (error) {
      if (isMissingTableError(error)) {
        tableMissing = true
        console.warn(
          `[audit] ${TABLE} 테이블이 없어 감사 로그를 건너뜁니다 — ` +
            'supabase/migrations/106_admin_audit_log.sql 적용 전 상태입니다. ' +
            '앱 동작에는 영향 없습니다.',
        )
        return
      }
      console.error(`[audit] 기록 실패 (action=${input.action})`, error.message)
    }
  } catch (e) {
    // 여기까지 온 예외는 삼킨다 — 로깅 때문에 삭제·수정이 롤백되면 안 된다.
    console.error(`[audit] 기록 중 예외 (action=${input.action})`, e)
  }
}
