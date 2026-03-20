import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const { pin } = await req.json()
  if (!pin) return NextResponse.json({ ok: false }, { status: 400 })
  if (pin === process.env.RECORD_PIN) return NextResponse.json({ ok: true })
  return NextResponse.json({ ok: false }, { status: 401 })
}
