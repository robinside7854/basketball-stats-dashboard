// 마지막으로 본 동호회 기억 — 설치형 앱이 대문에서 멈추지 않게 하는 장치.
//
// 왜 필요한가: 매니페스트의 start_url 은 오리진당 하나(`/`)다. 미라클 페이지에서 설치해도
//   앱을 열면 플랫폼 대문이 뜬다. 그런데 대문은 **의도적으로 막다른 길**이다 —
//   동호회 목록을 노출하지 않는 것이 원칙이라(파란날개 회원이 미라클의 존재를 알면 안 된다)
//   "주소를 모르면 총무에게 문의하세요"로 끝난다. 설치까지 한 회원에게 이 화면은 고장이다.
//   → 이 기기에서 마지막으로 본 동호회만 기억해 두고, 대문에 닿으면 거기로 보낸다.
//
// ⚠ 이것이 동호회 목록 노출 원칙을 깨지 않는 이유: 저장되는 것은 **그 사람이 이미 방문한**
//   동호회 하나뿐이고, 그 사람 기기 안에만 있다. 새로 알게 되는 정보가 없다.

const KEY = 'mm_last_league'

export interface LastLeague {
  /** 브라우저 경로 기준 base (예: /league/miracle/2026) — 미들웨어가 slug→UUID 로 rewrite 하므로
   *  UUID 가 아니라 주소창에 보이는 slug 경로를 저장한다. UUID 를 저장하면 링크가 사람에게 읽히지 않고,
   *  slug 가 바뀌었을 때 낡은 UUID 로 계속 들어가게 된다. */
  base: string
  /** 대문에서 버튼 라벨로 보여줄 이름. 없으면 버튼에 동호회명 대신 일반 문구를 쓴다 */
  name: string | null
  savedAt: number
}

export function rememberLeague(base: string, name: string | null): void {
  // 대문(`/`)이나 빈 경로를 저장하면 자기 자신으로 보내는 무한 루프가 된다.
  if (!base || !base.startsWith('/league/')) return
  try {
    localStorage.setItem(KEY, JSON.stringify({ base, name, savedAt: Date.now() } satisfies LastLeague))
  } catch { /* 시크릿 모드 등 저장소가 막힌 환경 — 기억만 못 할 뿐 앱은 정상 동작한다 */ }
}

export function readLastLeague(): LastLeague | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<LastLeague>
    // 저장 포맷이 바뀌었거나 손상된 값으로 엉뚱한 곳에 보내지 않는다.
    if (typeof parsed?.base !== 'string' || !parsed.base.startsWith('/league/')) return null
    return { base: parsed.base, name: typeof parsed.name === 'string' ? parsed.name : null, savedAt: Number(parsed.savedAt) || 0 }
  } catch {
    return null
  }
}
