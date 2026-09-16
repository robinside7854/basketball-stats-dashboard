// 게스트 판별 — 이름으로 본다.
// 왜 이름인가: league_players.is_guest 컬럼은 POST 경로에서만 자동으로 채워져서
// 그 전에 들어온 행·직접 수정된 행에는 값이 없다. 반면 운영 명단의 게스트는 예외 없이
// 이름에 "게스트" 가 들어 있다("0131게스트A", "구범준 게스트"). 드래프트에서 게스트가
// 한 명이라도 새면 실전 픽이 망가지므로, 확실히 걸리는 쪽을 쓴다.
export function isGuestPlayer(name: string): boolean {
  return name.includes('게스트')
}
