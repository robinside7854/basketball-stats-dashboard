'use client'
// 홈 우측 상단 — 이 팀 페이지 링크를 공유한다.
//
// 왜 홈 헤더인가: 단톡방에 던질 링크는 "우리 팀 페이지"다. 특정 기능 카드 안에 두면
//   그 기능이 바뀔 때마다 공유 버튼이 같이 흔들리고, 찾는 사람은 매번 다른 자리를 뒤진다.
//   팀 이름 옆이 그 링크의 제자리다.
//
// Web Share 를 먼저 쓴다 — 설치한 앱(PWA standalone)에서도 카카오톡이 시스템 공유 시트에
//   그대로 뜬다. 카카오 SDK 를 붙이면 앱키·도메인 등록·스크립트 로드가 따라오는데,
//   얻는 건 카톡 전용 카드뿐이라 그 무게를 지지 않았다.
import { useState } from 'react'
import { Share2, Check } from 'lucide-react'
import { toast } from 'sonner'

export default function ShareLeagueButton({ leagueName }: { leagueName: string }) {
  const [copied, setCopied] = useState(false)

  async function share() {
    // 쿼리·해시를 떼고 홈 주소만 넘긴다 — 내 화면 상태(필터·탭)가 남의 링크에 묻어가면 안 된다.
    const url = window.location.href.split(/[?#]/)[0]

    if (navigator.share) {
      try {
        await navigator.share({ title: leagueName, url })
        return
      } catch (e) {
        // 공유 시트를 닫은 건 실패가 아니다 — 여기서 에러를 띄우면 잘못한 것처럼 보인다.
        if (e instanceof Error && e.name === 'AbortError') return
        // 그 밖의 실패(미지원·권한)는 아래 복사로 이어간다.
      }
    }

    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast.success('링크를 복사했습니다 — 단톡방에 붙여넣으세요')
      // 아이콘을 잠깐 체크로 바꿔 눌린 걸 알린다. 토스트만으로는 놓치는 사람이 있다.
      setTimeout(() => setCopied(false), 1600)
    } catch {
      toast.error('복사하지 못했습니다')
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      aria-label="이 팀 페이지 링크 공유"
      title="링크 공유"
      className="shrink-0 inline-flex items-center justify-center min-w-[44px] min-h-[44px] cursor-pointer transition-colors hover:bg-[color:var(--mm-panel-alt)]"
      style={{
        border: '1px solid var(--mm-rule)',
        color: copied ? 'var(--mm-positive)' : 'var(--mm-ink-soft)',
        borderRadius: 'var(--mm-radius-ctl)',
        transitionDuration: 'var(--mm-motion-fast)',
      }}
    >
      {copied ? <Check size={18} aria-hidden /> : <Share2 size={18} aria-hidden />}
    </button>
  )
}
