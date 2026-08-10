// 오프라인 폴백 — 네트워크가 끊긴 채로 페이지 이동을 시도했을 때 서비스워커가 대신 내주는 화면.
//
// ⚠ 스타일을 전부 인라인 리터럴로 박는다. 토큰(var(--mm-*))도, Tailwind 클래스도 쓰지 않는다.
//    이 화면이 뜨는 상황은 정의상 네트워크가 없는 때다. CSS 파일이 캐시에 없으면
//    클래스는 아무것도 안 하고 토큰은 해석되지 않아 흰 배경에 검은 글씨만 남는다.
//    "오프라인일 때 유일하게 보이는 화면"이 깨져 보이면 앱이 고장 난 것처럼 읽힌다.
//
// 색은 다크 지반(--mm-ground #191714)·브랜드 옐로(--mm-yellow 계열)의 현재 값을 복사해 둔 것이다.
// 토큰이 바뀌어도 자동으로 따라오지 않는다 — 위 이유로 감수하는 비용이다.
export const dynamic = 'force-static'

export const metadata = { title: '오프라인 · 온볼' }

export default function OfflinePage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
        padding: 24,
        background: '#191714',
        color: '#F5F2EC',
        fontFamily: 'Pretendard, system-ui, -apple-system, sans-serif',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          border: '3px solid #EAB308',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 30,
        }}
        aria-hidden
      >
        {/* 농구공 궤적을 흉내 낸 선 두 개 — 이미지 요청을 만들지 않으려고 SVG 를 인라인으로 둔다 */}
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#EAB308" strokeWidth="1.8">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 2a14 14 0 0 0 0 20M12 2a14 14 0 0 1 0 20M2 12h20" />
        </svg>
      </div>

      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 8px' }}>연결이 끊겼어요</h1>
        <p style={{ fontSize: 14, lineHeight: 1.7, color: '#B8B0A4', margin: 0 }}>
          경기 기록과 순위는 실시간 데이터라
          <br />
          인터넷에 연결돼야 볼 수 있어요.
        </p>
      </div>

      {/* 새로고침은 링크가 아니라 히스토리 재시도로 — 오프라인 상태에서 링크를 누르면
          또 이 화면으로 돌아와 사용자가 제자리를 돈다. */}
      <a
        href="/"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 44,
          padding: '0 20px',
          borderRadius: 8,
          background: '#EAB308',
          color: '#191714',
          fontSize: 14,
          fontWeight: 700,
          textDecoration: 'none',
        }}
      >
        다시 시도
      </a>
    </div>
  )
}
