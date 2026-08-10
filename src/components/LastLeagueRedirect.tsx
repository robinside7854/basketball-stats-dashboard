'use client'
// 대문에서 내 동호회로 되돌려 보내기.
//
// 문제: 설치형 앱은 항상 대문(`/`)으로 열린다. 매니페스트의 start_url 이 오리진당 하나뿐이라
//   미라클 페이지에서 설치해도 마찬가지다. 그런데 대문은 의도적으로 막다른 길이다 —
//   "주소를 모르면 총무에게 문의하세요"로 끝난다. 설치까지 한 회원에게는 고장으로 읽힌다.
//
// 해결: 이 기기에서 마지막으로 본 동호회가 있으면 거기로 보낸다.
//   ⚠ 동호회 목록 비노출 원칙을 깨지 않는다 — 이미 방문한 곳 하나를, 그 사람 기기에서만 읽는다.
//
// ⚠ replace 를 쓴다. push 를 쓰면 동호회 화면에서 뒤로 가기를 눌렀을 때 대문으로 왔다가
//   다시 동호회로 튕겨 나가 뒤로 가기가 영원히 안 먹는 덫이 된다.
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { readLastLeague, type LastLeague } from '@/lib/lastLeague'

export default function LastLeagueRedirect() {
  const router = useRouter()
  const [last, setLast] = useState<LastLeague | null>(null)

  useEffect(() => {
    const found = readLastLeague()
    if (!found) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage 판정은 클라이언트 전용, 마운트 1회
    setLast(found)
    router.replace(found.base)
  }, [router])

  // 자동 이동이 정답이지만, 그것만 두면 실패했을 때(라우터 오류·저장소 이상) 사용자는
  // 다시 막다른 대문에 남는다. 눈에 보이는 길을 하나 같이 둔다.
  if (!last) return null

  return (
    <a
      href={last.base}
      className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-md font-bold text-sm cursor-pointer transition-colors mt-6"
      style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)' }}
    >
      {last.name ? `${last.name} 기록 보기` : '내 동호회로 이동'}
      <ArrowRight size={16} aria-hidden />
    </a>
  )
}
