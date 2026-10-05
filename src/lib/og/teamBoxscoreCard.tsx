import { ImageResponse } from 'next/og'
import { glyphSet, loadKoreanFont } from '@/lib/og/font'
import { fmtDate, dateRange, type ShareInfo } from '@/lib/og/teamBoxscoreShare'

// 파란날개 박스스코어 공유 카드 그림 (2026-10-05) — 조회는 하지 않는다(teamBoxscoreShare.ts 가 함).
//   경기 카드: 팀명 · 스코어 · 상대 · 대회/라운드 · 날짜
//   대회 카드: 팀명 · 대회명 · 기간 · 전적

const W = 1200, H = 630
const COLOR = { ground: '#191714', panel: '#24211C', ink: '#F2EEE6', muted: '#A9A294', yellow: '#EAB308', win: '#34D399', loss: '#F87171' }

// 한 줄 84px 는 12자 안팎까지, 그보다 길면 줄여서 최대 두 줄
function tourSize(name: string) {
  const n = name.length
  return n <= 12 ? 84 : n <= 18 ? 68 : n <= 30 ? 58 : 48
}

function clip(s: string, max: number) {
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

function texts(info: ShareInfo): string[] {
  if (info.kind === 'game') {
    return [info.teamName, info.opponent, info.tournamentName, info.round ?? '', fmtDate(info.date), `${info.ourScore}${info.oppScore}`, 'vs 승패무 경기 기록 박스스코어 ·:.']
  }
  return [info.teamName, info.tournamentName, dateRange(info.firstDate, info.lastDate), `${info.wins}${info.losses}${info.draws}${info.games}`, '대회 전체 기록 승패무 경기 ·~.']
}

// 카드 그리기만 담당(조회 없음) — 라우트가 부르고, 레이아웃 점검 스크립트도 가짜 데이터로 부른다
export async function renderShareCard(info: ShareInfo): Promise<ImageResponse> {
  const font = await loadKoreanFont(glyphSet('ONBALL', '…', ...texts(info)), 700)

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <svg width={46} height={40} viewBox="0 0 152 132" fill="none" stroke={COLOR.yellow} strokeWidth={9} strokeLinecap="round">
          <circle cx="76" cy="66" r="52" />
          <path d="M25 66 H127" />
          <path d="M76 14 V118" />
          <path d="M41 25 C 60 45, 60 87, 41 107" />
          <path d="M111 25 C 92 45, 92 87, 111 107" />
        </svg>
        <div style={{ display: 'flex', fontSize: 30, color: COLOR.ink, letterSpacing: 1 }}>ONBALL</div>
      </div>
      <div style={{ display: 'flex', fontSize: 28, color: COLOR.muted }}>{info.kind === 'game' ? '경기 박스스코어' : '대회 전체 기록'}</div>
    </div>
  )

  let body: React.ReactElement
  if (info.kind === 'game') {
    const res = !info.isComplete ? null : info.ourScore > info.oppScore ? '승' : info.ourScore < info.oppScore ? '패' : '무'
    const resColor = res === '승' ? COLOR.win : res === '패' ? COLOR.loss : COLOR.muted
    // 팀명 길이가 제각각이라 좌우 배치는 긴 이름에서 줄바꿈이 났다 → 이름 한 줄 + 아래 큰 스코어
    const vsSize = (info.teamName.length + info.opponent.length) > 18 ? 44 : 54
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', fontSize: (info.tournamentName.length + (info.round?.length ?? 0)) > 26 ? 28 : 32, color: COLOR.muted }}>
          {clip([info.tournamentName, info.round].filter(Boolean).join(' · '), 44)}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', fontSize: vsSize, color: COLOR.ink, letterSpacing: -1 }}>
          <div style={{ display: 'flex' }}>{clip(info.teamName, 12)}</div>
          <div style={{ display: 'flex', color: COLOR.muted, fontSize: vsSize * 0.7, margin: '0 20px' }}>vs</div>
          <div style={{ display: 'flex' }}>{clip(info.opponent, 12)}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ display: 'flex', fontSize: 120, color: res === '패' ? COLOR.muted : COLOR.yellow, lineHeight: 1 }}>{info.ourScore}</div>
            <div style={{ display: 'flex', fontSize: 70, color: COLOR.muted }}>:</div>
            <div style={{ display: 'flex', fontSize: 120, color: res === '패' ? COLOR.yellow : COLOR.muted, lineHeight: 1 }}>{info.oppScore}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 14 }}>
            {res && (
              <div style={{ display: 'flex', fontSize: 40, color: COLOR.ground, background: resColor, padding: '4px 22px', borderRadius: 10 }}>{res}</div>
            )}
            <div style={{ display: 'flex', fontSize: 36, color: COLOR.ink }}>{fmtDate(info.date)}</div>
          </div>
        </div>
      </div>
    )
  } else {
    const rec = info.games > 0 ? `${info.wins}승 ${info.losses}패${info.draws ? ` ${info.draws}무` : ''}` : ''
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div style={{ display: 'flex', fontSize: 40, color: COLOR.muted }}>{clip(info.teamName, 20)}</div>
        {/* 대회명은 길다(실제: 「2026 바다배 농구대회 전국 파이널 토너먼트」 26자) — 24자에서 자르던 것을
            길이별로 글자를 줄이고 두 줄까지 단어 단위로 접는다 */}
        <div style={{ display: 'flex', maxWidth: 1040, fontSize: tourSize(info.tournamentName), color: COLOR.ink, lineHeight: 1.2, letterSpacing: -1, wordBreak: 'keep-all' }}>
          {clip(info.tournamentName, 44)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginTop: 8 }}>
          {rec && <div style={{ display: 'flex', fontSize: 44, color: COLOR.yellow }}>{rec}</div>}
          {info.games > 0 && <div style={{ display: 'flex', fontSize: 34, color: COLOR.muted }}>{info.games}경기</div>}
          <div style={{ display: 'flex', fontSize: 34, color: COLOR.ink }}>{dateRange(info.firstDate, info.lastDate)}</div>
        </div>
      </div>
    )
  }

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: COLOR.ground, padding: '64px 80px', position: 'relative' }}>
        <div style={{ position: 'absolute', top: -220, right: -180, width: 640, height: 640, borderRadius: '50%', background: COLOR.yellow, opacity: 0.12, filter: 'blur(60px)' }} />
        {header}
        {body}
        <div style={{ display: 'flex', width: '100%', height: 12, background: COLOR.yellow, borderRadius: 6 }} />
      </div>
    ),
    {
      width: W,
      height: H,
      fonts: font ? [{ name: 'Noto Sans KR', data: font, weight: 700, style: 'normal' as const }] : undefined,
      headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' },
    },
  )
}
