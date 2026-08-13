// 리그별 설치본 정체성 — "이 동호회에서 홈 화면에 추가하면 이 동호회로 열린다"를 만드는 값들.
//
// ── 왜 리그별 매니페스트가 필요한가 (2026-08-13) ─────────────────────────────
// 루트 매니페스트의 `start_url` 은 오리진당 하나('/')다. 그래서 미라클 페이지에서 설치해도
// 설치본은 대문(`/`)으로 열린다. 대문은 **의도적으로 막다른 길**이라(동호회 목록 비노출 원칙)
// 회원 입장에선 고장으로 읽힌다.
//
// 앞서 만든 `lastLeague`(localStorage 로 마지막 동호회를 기억해 대문에서 되돌려보내기)는
// **안드로이드에서만 동작한다.** iOS 의 "홈 화면에 추가" 웹앱은 사파리 본체와 **저장소 파티션이
// 분리**돼 있어서(localStorage·쿠키·서비스워커 전부 별도 컨테이너), 사파리에서 저장한
// `mm_last_league` 를 설치본이 읽을 수 없다. 첫 실행은 항상 빈 저장소 → 대문에서 멈춘다.
// 안드로이드 Chrome 은 설치본과 브라우저가 저장소를 공유하므로 같은 코드가 동작한다 —
// "안드로이드는 되는데 아이폰만 안 된다"는 증상이 정확히 이 차이다.
// ⇒ 클라이언트 저장소로는 원리적으로 못 고친다. **설치 시점에 start_url 자체를 그 동호회로**
//   박아야 한다. 그래서 리그 화면은 자기 매니페스트를 링크한다.
//
// ── 이름 정책 ────────────────────────────────────────────────────────────────
// "앱 정체성은 온볼 하나"라는 기존 결정(src/app/manifest.ts 주석·CLAUDE.md)은 유지한다.
//   name       = '온볼 — <동호회명>'  (앱 스토어/설치 다이얼로그에 보이는 정식 이름)
//   short_name = '<동호회명>'         (홈 화면 아이콘 라벨 — 회원 눈엔 자기 동호회여야 뜻이 통한다)
//   start_url  = 그 동호회 경로       (이번 수정의 본체)
// 비공개 리그는 이름을 아예 싣지 않는다 — layout 의 generateMetadata 가 비공개 리그의 탭 제목에서
// 클럽명을 빼는 것과 같은 원칙(매니페스트는 쿠키 없이 요청될 수 있다).

import { createClient } from '@/lib/supabase/admin'
import { isLeaguePublic, getApprovedSession } from '@/lib/auth/guard'

export interface LeagueAppIdentity {
  /** 브라우저에 실제로 보이는 slug 경로 (예: /league/miracle/2026) */
  base: string
  /** 매니페스트 name — 항상 '온볼' 계열 */
  name: string
  /** 매니페스트 short_name = iOS apple-mobile-web-app-title */
  shortName: string
  /** 이 리그 매니페스트의 절대경로 */
  manifestPath: string
}

/**
 * leagueId(미들웨어 rewrite 이후이므로 UUID)로 설치본 정체성을 만든다.
 *
 * ⚠ start_url 에 UUID 를 박으면 안 된다. 미들웨어가 slug→UUID 로 internal rewrite 하므로
 *   `params.leagueId` 는 UUID 지만 주소창은 slug 다. UUID 경로는 (a) 사람이 못 읽고
 *   (b) 미들웨어가 301 로 slug 로 되돌리며 (c) slug 가 바뀌면 낡은 값으로 남는다.
 *   → DB 의 `leagues.slug` / `leagues.org_slug` 로 **주소창과 같은 경로**를 만든다.
 *
 * 리그를 못 찾으면 null (호출부는 루트 매니페스트로 폴백). 조회 자체가 실패하면 throw —
 * 빈 결과로 삼키면 "설치했는데 조용히 대문으로 열리는" 원래 증상으로 되돌아간다.
 */
export async function resolveLeagueAppIdentity(
  leagueId: string,
  /** 호출부가 이미 공개여부·세션을 판정했으면 넘겨서 중복 조회를 피한다(미지정이면 여기서 판정). */
  opts?: { visible?: boolean },
): Promise<LeagueAppIdentity | null> {
  // 미들웨어가 slug→UUID rewrite 에 성공하면 여기 오는 값은 항상 UUID 다. UUID 가 아니라는 것은
  // "그런 리그가 없다"(또는 조회 실패로 rewrite 를 못 했다)는 뜻 — 그대로 .eq('id', …) 를 던지면
  // Postgres 가 `invalid input syntax for type uuid` 로 500 을 만든다. 없는 것은 없다고 답한다.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(leagueId)) return null

  const sb = createClient()
  const { data, error } = await sb
    .from('leagues')
    .select('slug, org_slug, name, teams(name)')
    .eq('id', leagueId)
    .maybeSingle()
  if (error) throw new Error(`leagues: leagueId=${leagueId} 매니페스트용 조회 실패 — ${error.message}`)
  if (!data) return null

  const row = data as { slug: string | null; org_slug: string | null; name: string | null; teams?: { name?: string | null } | null }
  if (!row.slug || !row.org_slug) return null

  const base = `/league/${row.org_slug}/${row.slug}`

  // 비공개 리그는 쿠키 없는 매니페스트 요청에서 이름을 노출하지 않는다.
  // (start_url 은 요청자가 이미 아는 경로 그 자체라 새로 새는 정보가 없다.)
  const visible = opts?.visible ?? ((await isLeaguePublic(leagueId)) || !!(await getApprovedSession(leagueId)))
  const clubName = (row.teams?.name || row.name || '').trim()

  const shortName = visible && clubName ? clubName : '온볼'
  const name = visible && clubName ? `온볼 — ${clubName}` : '온볼 OnBall'

  return { base, name, shortName, manifestPath: `${base}/manifest.webmanifest` }
}
