import { redirect } from 'next/navigation'

// 조직(org) 개념이 어드민 화면에서 사라졌다 (2026-08-06) — 리그·대회 생성 폼은
// /admin/leagues/new 하나로 통합(원래도 같은 API를 쓰는 중복 화면이었다).
export default function AdminOrgLeagueNewRedirect() {
  redirect('/admin/leagues/new')
}
