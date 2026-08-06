import { redirect } from 'next/navigation'

// 조직(org) 개념이 어드민 화면에서 사라졌다 (2026-08-06) — 팀 생성 폼은 /admin/teams/new 로 이관.
export default function AdminOrgsNewRedirect() {
  redirect('/admin/teams/new')
}
