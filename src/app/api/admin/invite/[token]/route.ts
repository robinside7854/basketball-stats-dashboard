// GET /api/admin/invite/[token]   — **공개** (아직 계정이 없는 사람이 여는 경로다)
//   초대 토큰의 유효성만 알려준다. checkInvite() 결과를 그대로 옮긴다.
//
// 이메일을 응답에 담는 것은 의도적이다 — 초대받은 본인이 "내 주소가 맞나" 를 확인하고
// 비밀번호를 정하는 화면이라서다. 토큰(256비트 랜덤)을 가진 사람만 여기까지 오므로
// 이메일 하나가 더 나가도 이미 그 사람에게 보낸 정보의 범위 안이다.
import { NextResponse } from 'next/server'
import { checkInvite } from '@/lib/auth/platformAdmin'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const result = await checkInvite(token ?? '')
  return NextResponse.json(result)
}
