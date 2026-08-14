// 메일 발송 (서버 전용) — Resend HTTP API 를 fetch 로 직접 호출한다.
//
// 패키지를 안 쓰는 이유: 지금 필요한 건 "텍스트 메일 한 통 보내기" 하나뿐이라
// 의존성을 하나 늘릴 만큼의 값이 없다. 나중에 템플릿·첨부가 필요해지면 그때 붙인다.
//
// ⚠ 도메인 인증 전 제약 (2026-08-14 기준)
//   온볼 도메인(onball.kr 등)이 아직 없어 Resend 에 인증된 발신 도메인이 없다.
//   그래서 발신자는 Resend 가 기본 제공하는 onboarding@resend.dev 이고,
//   이 상태에서는 **Resend 가입 계정 본인 주소로만** 발송된다.
//   → 지금 쓰이는 곳은 '접근 요청 알림'(소유자에게 보내는 메일) 하나뿐이라 문제가 없다.
//   → 공동관리자 초대는 메일이 아니라 화면에서 링크를 복사해 전달하는 방식이다.
//   도메인이 생기면 MAIL_FROM 만 바꾸면 제3자 발송까지 열린다.
//
// 발송 실패는 절대 호출부의 작업을 실패시키지 않는다. 접근 요청은 DB 에 남는 것이
// 원본이고 메일은 알림일 뿐이다 — 메일이 안 나갔다고 요청 접수까지 실패하면
// 요청한 사람만 손해다.

const RESEND_ENDPOINT = 'https://api.resend.com/emails'
const DEFAULT_FROM = '온볼 <onboarding@resend.dev>'

export type SendResult = { sent: boolean; reason?: string }

export function isMailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY)
}

/** 접근 요청 등 운영 알림을 받을 주소. 미설정이면 ADMIN_EMAIL 로 떨어진다. */
export function ownerNotifyAddress(): string | null {
  return process.env.OWNER_NOTIFY_EMAIL || process.env.ADMIN_EMAIL || null
}

export async function sendMail(opts: {
  to: string
  subject: string
  text: string
  html?: string
}): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    // 키가 없어도 조용히 넘어간다. 개발 환경과 '아직 메일 설정 전' 상태를 같은 코드로 지난다.
    console.warn('[mail] RESEND_API_KEY 미설정 — 발송을 건너뜁니다:', opts.subject)
    return { sent: false, reason: 'not_configured' }
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.MAIL_FROM || DEFAULT_FROM,
        to: [opts.to],
        subject: opts.subject,
        text: opts.text,
        ...(opts.html ? { html: opts.html } : {}),
      }),
      // 크롤러가 아니라 사용자 요청 경로에 물려 있으므로 오래 붙잡지 않는다.
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(`[mail] 발송 실패 ${res.status} — ${body.slice(0, 300)}`)
      return { sent: false, reason: `http_${res.status}` }
    }
    return { sent: true }
  } catch (e) {
    console.error('[mail] 발송 예외', e)
    return { sent: false, reason: 'exception' }
  }
}
