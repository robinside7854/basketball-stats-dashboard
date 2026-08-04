import { Basketball } from '@/components/league/BasketballIcons'

// 온볼 소개 화면 (플랫폼 대문).
//
// ⚠️ 여기에 동호회 목록을 절대 노출하지 않는다.
//    동호회는 기본적으로 폐쇄적으로 운영된다 — 파란날개 회원이 미라클의 존재를
//    링크를 공유받지 않은 채 알게 되면 안 된다. 대문을 우연히 열었다가
//    다른 동호회를 발견하는 경로가 생기면 그 원칙이 깨진다.
//
//    사용자는 자기 동호회 링크(/league/<org>/<season>)로 직접 들어온다.
//    이 화면은 org 를 지운 URL 로 흘러들어온 사람이 보게 되는 자리이므로,
//    "여기가 무엇인지"만 알려주고 끝낸다.
//
// 예전엔 이 자리에 파란날개 청년부/장년부 2분할 랜딩이 하드코딩돼 있었다.
export const metadata = {
  title: '온볼 OnBall',
  description: '구기 동호회의 경기 영상에 기록을 붙여, 선수 개인의 하이라이트와 시즌 기록을 각자에게 돌려주는 서비스',
}

export default function OnBallIntro() {
  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-6 py-20"
      style={{ background: 'var(--mm-ground)' }}
    >
      <div className="w-full max-w-lg">
        <div className="flex items-center gap-2.5 mb-6">
          <Basketball size={30} />
          <span
            className="font-jersey font-black uppercase"
            style={{ color: 'var(--mm-ink)', fontSize: 34, letterSpacing: '0.14em' }}
          >
            OnBall
          </span>
        </div>

        {/* 태그라인은 한 화면에 하나만 (브랜드 가이드 4장) */}
        <h1
          className="font-jersey font-black break-keep mb-5"
          style={{ color: 'var(--mm-ink)', fontSize: 'clamp(28px, 7vw, 40px)', lineHeight: 1.25, letterSpacing: '-0.01em' }}
        >
          공이 온 순간은,
          <br />
          사라지지 않는다
        </h1>

        <p
          className="text-[15px] leading-relaxed break-keep mb-10"
          style={{ color: 'var(--mm-ink-soft)' }}
        >
          구기 동호회의 경기 영상에 기록을 붙여,
          <br className="hidden sm:block" />
          선수 개인의 하이라이트와 시즌 기록을 각자에게 돌려주는 서비스입니다.
        </p>

        <div
          className="px-4 py-3.5"
          style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)' }}
        >
          <p className="text-sm leading-relaxed break-keep" style={{ color: 'var(--mm-ink-soft)' }}>
            소속 동호회의 기록은 <strong style={{ color: 'var(--mm-ink)' }}>동호회 전용 주소</strong>로 들어갑니다.
            주소를 모르신다면 팀 총무에게 문의해 주세요.
          </p>
        </div>
      </div>
    </main>
  )
}
