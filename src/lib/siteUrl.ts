// 서비스 공개 주소 한 곳 — 어드민 화면이 "회원에게 공유할 링크"를 만들 때 쓴다.
//
// 왜 상수가 아니라 env 인가: 온볼 전용 도메인(onball.*)으로 옮기는 중이다.
// 주소가 여러 파일에 흩어져 있으면 이전 때 한 곳을 빠뜨리고, 어드민이 죽은 링크를
// 회원에게 복사해 보내게 된다. 값은 Vercel 환경변수 NEXT_PUBLIC_SITE_URL 하나만 바꾼다.
//
// NEXT_PUBLIC_ 접두사는 빌드 시점에 인라인되므로, 값을 바꾸면 반드시 재배포해야 반영된다.
const FALLBACK = 'https://basketball-stats-dashboard.vercel.app'

// 끝의 '/' 는 제거 — `${siteUrl()}/league/...` 로 이어붙일 때 '//' 가 생기는 걸 막는다.
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? FALLBACK).replace(/\/+$/, '')
}

// 주소창에 보여주는 용도 — 프로토콜을 떼고 도메인만 남긴다.
export function siteHost(): string {
  return siteUrl().replace(/^https?:\/\//, '')
}
