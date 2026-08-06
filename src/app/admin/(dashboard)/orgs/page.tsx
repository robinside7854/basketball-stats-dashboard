import { redirect } from 'next/navigation'

// 조직(org) 개념이 어드민 화면에서 사라졌다 (2026-08-06) — 팀이 최상위 단위가 됐고,
// 팀 목록은 이제 /admin/leagues 하나에서 (대회가 없는 팀도 포함해) 보여준다.
// 예전 /admin/orgs 링크를 북마크해 둔 사람이 있을 수 있어 리다이렉트만 남긴다.
export default function AdminOrgsRedirect() {
  redirect('/admin/leagues')
}
