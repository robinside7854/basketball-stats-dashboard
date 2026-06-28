// 코미셔너(가상 운영진) 멘트 풀.
//
// 이벤트 종류별로 여러 줄을 두고 시드(이벤트 id)로 결정성 있게 선택한다.
// 같은 이벤트가 모든 클라이언트에서 동일한 멘트로 보이도록.
//
// 토큰: {teamName}, {playerName}, {round}, {pick}

export interface LineContext {
  teamName?: string
  playerName?: string
  round?: number | string
  pick?: number | string
}

export type LineEvent =
  | 'draftStart'
  | 'draftEnd'
  | 'lotteryStart'
  | 'lotteryResult'
  | 'pickAnnounce'
  | 'pickReaction'
  | 'myTurn'

const LINES: Record<LineEvent, string[]> = {
  draftStart: [
    '여러분, 드디어 오늘의 드래프트를 시작하겠습니다!',
    '준비된 단장님들, 운명의 시간이 다가왔습니다.',
    '관중 여러분, 환영합니다. 이제 픽이 시작됩니다!',
    '드래프트 보드를 열겠습니다. 모두 집중해 주세요.',
  ],
  draftEnd: [
    '수고하셨습니다! 멋진 드래프트였습니다.',
    '오늘의 드래프트가 마무리되었습니다. 모든 팀에게 박수를!',
    '이로써 새 시즌의 첫 그림이 완성됐습니다. 감사합니다!',
    '오늘 보여주신 결정들이 시즌의 운명을 가를 겁니다. 멋졌어요!',
  ],
  lotteryStart: [
    '여러분, 추첨이 시작됩니다!',
    '운명의 공이 굴러갑니다 — 누가 1순위를 차지할까요?',
    '집중하세요, 곧 픽 순서가 결정됩니다.',
    'NBA 스타일 추첨 — 결과는 곧 화면에 나타납니다.',
  ],
  lotteryResult: [
    '{teamName}이(가) 1픽 권리를 획득했습니다!',
    '축하합니다, {teamName} — 첫 번째 픽은 여러분의 것입니다!',
    '오늘의 행운팀은 {teamName}! 1순위 픽 확정.',
    '{teamName}이(가) 추첨 1위! 시즌의 주도권을 잡았습니다.',
  ],
  pickAnnounce: [
    '{round}라운드 {pick}번째 픽, {teamName}은(는) {playerName} 선수를 선택합니다!',
    'On the clock, {teamName} — 선택은 {playerName}!',
    '{teamName}의 {round}라운드 {pick}픽 — {playerName} 선수입니다.',
    '주목하세요, {teamName}이(가) {playerName} 선수를 호명했습니다!',
  ],
  pickReaction: [
    '좋은 선택입니다!',
    '관중석이 들썩입니다!',
    '기대됩니다 — 어떤 활약을 보여줄까요?',
    '의외의 픽이군요, 흥미진진합니다.',
    '베테랑 다운 선택입니다.',
    '시즌의 분위기가 달라질 만한 픽입니다.',
    '바로 그 자리에 필요한 선수죠.',
  ],
  myTurn: [
    '{teamName}, 시간이 흐르고 있습니다 — 선택해 주세요!',
    '{teamName} 차례입니다. 신중하게, 그러나 빠르게!',
    '주목, {teamName} — 누구를 호명하시겠습니까?',
  ],
}

/** djb2-like 해시 (결정성 있고 충돌 거의 없음 — 짧은 문자열용) */
function hashSeed(seed: string): number {
  let h = 5381
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) + h) + seed.charCodeAt(i)
    h = h & 0x7fffffff
  }
  return h
}

function interpolate(template: string, ctx: LineContext): string {
  return template
    .replace(/\{teamName\}/g, ctx.teamName ?? '')
    .replace(/\{playerName\}/g, ctx.playerName ?? '')
    .replace(/\{round\}/g, String(ctx.round ?? ''))
    .replace(/\{pick\}/g, String(ctx.pick ?? ''))
}

/**
 * 시드 기반 멘트 선택. 같은 seed 면 항상 같은 줄 → 모든 클라이언트가 동일 텍스트.
 */
export function pickLine(event: LineEvent, seed: string, ctx: LineContext = {}): string {
  const pool = LINES[event]
  if (!pool || pool.length === 0) return ''
  const idx = hashSeed(seed + ':' + event) % pool.length
  return interpolate(pool[idx], ctx)
}
