// 미라클 총무(가상 운영진) 멘트 풀.
//
// 이벤트 종류별로 여러 줄을 두고 시드(이벤트 id)로 결정성 있게 선택한다.
// 같은 이벤트가 모든 클라이언트에서 동일한 멘트로 보이도록.
//
// 토큰: {teamName}, {playerName}, {round}, {pick}, {seconds}

export interface LineContext {
  teamName?: string
  playerName?: string
  round?: number | string
  pick?: number | string
  seconds?: number | string
}

export type LineEvent =
  | 'intro'
  | 'draftStart'
  | 'draftEnd'
  | 'lotteryStart'
  | 'lotteryResult'
  | 'pickAnnounce'
  | 'pickReaction'
  | 'roundTransition'
  | 'finalPick'
  | 'pickSecondsChanged'
  | 'readyToggledOn'
  | 'readyToggledOff'
  | 'myTurn'

const LINES: Record<LineEvent, string[]> = {
  intro: [
    '안녕하세요, 저는 미라클 드래프트 총무입니다. 지금부터 픽 순서 추첨을 진행하겠습니다!',
    '반갑습니다, 미라클 드래프트 총무입니다. 잠시 후 픽 순서를 결정하는 추첨이 시작됩니다.',
    '미라클 총무 인사드립니다. 자, 운명의 추첨을 시작해 보겠습니다!',
    '여러분 안녕하세요, 미라클 드래프트의 총무입니다. 추첨 준비 들어갑니다.',
  ],
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
  // 방송 중계 스타일 — 다양한 톤으로 20+ 변형
  pickAnnounce: [
    // Standard
    '{round}라운드 {pick}번째 픽, {teamName}이(가) {playerName}을(를) 선택합니다!',
    '{round}라운드 {pick}픽 — {teamName}, {playerName} 호명.',
    'On the clock, {teamName} — 선택은 {playerName}!',
    // Dramatic
    '오! {teamName}, 결단을 내렸습니다 — {playerName}!',
    '{teamName}, 망설임 끝에 결정 — {playerName}입니다!',
    '드디어 {teamName}의 결정 — {playerName} 픽업!',
    // Analytical
    '{round}라운드 {pick}번 픽 — {teamName}의 선택은 {playerName}입니다. 전략적인 카드네요.',
    '{teamName}의 {round}라운드 {pick}픽 — {playerName} 선수, 계산된 한 수입니다.',
    // Excited
    '기다리던 순간! {teamName}이 {playerName}을 호명합니다!',
    '와우! {teamName}, {playerName} 선수를 데려갑니다!',
    '여기서 {playerName}! {teamName}의 과감한 선택!',
    // Surprised
    '이거 의외인데요? {teamName}, {playerName}을 데려갑니다!',
    '깜짝 선택입니다 — {teamName}이 {playerName}을 호명!',
    '예상 밖의 카드 — {teamName}, {playerName} 영입!',
    // Narrative
    '{round}라운드 {pick}번 픽 — {teamName}, 오늘의 핵심 선수 {playerName} 영입!',
    '{teamName}의 {round}라운드 {pick}픽 — 새 시즌의 색깔을 결정짓는 {playerName} 선수입니다.',
    // Suspenseful
    '잠시 정적을 깨고... {teamName}, {playerName}을 지명합니다!',
    '시간이 멈춘 듯한 순간 — {teamName}의 선택, {playerName}!',
    // Confident
    '{teamName}, 한치의 망설임 없이 {playerName}!',
    '{teamName}의 의지가 분명합니다 — {playerName}!',
    // Reflective
    '역시 그랬군요. {teamName}이 {playerName}을 가져갑니다.',
    '그럴 만한 픽입니다. {teamName} — {playerName}.',
    // Broadcast classic
    '{round}라운드 {pick}번째 픽으로 {teamName}이(가) {playerName} 선수를 선택했습니다!',
    '주목, {teamName}의 {round}라운드 {pick}픽 — {playerName} 선수입니다.',
  ],
  pickReaction: [
    '좋은 선택입니다.',
    '관중석이 들썩이네요.',
    '기대를 모으게 합니다.',
    '의외의 픽이군요, 흥미진진합니다.',
    '베테랑 다운 선택입니다.',
    '시즌의 분위기가 달라질 만한 픽입니다.',
    '바로 그 자리에 필요한 선수죠.',
    '이 픽, 어떻게 평가하시나요?',
    '{teamName}의 다음 행보가 궁금해집니다.',
    '이 선수, 다음 분기에서 보여줄 게 많을 겁니다.',
    '스카우터들이 미소 짓겠어요.',
    '벤치가 만족스러운 표정입니다.',
    '한 픽 한 픽이 의미 있게 흘러가네요.',
    '전략이 보이기 시작합니다.',
    '코트 위에서 빛날 카드입니다.',
    '단단한 한 수네요.',
    '이건 분명 의도된 픽입니다.',
    '경기력에 변화를 줄 만한 선택입니다.',
  ],
  roundTransition: [
    '{round}라운드가 시작됩니다! 다시 집중해 주세요.',
    '자, 이제 {round}라운드입니다. 픽 순서가 이어집니다.',
    '한 라운드 마무리 — 곧 {round}라운드가 펼쳐집니다.',
    '{round}라운드 진입 — 새로운 흐름이 시작됩니다.',
  ],
  finalPick: [
    '이것으로 드래프트의 모든 픽이 완료되었습니다! 수고하셨습니다.',
    '마지막 픽까지 끝났습니다. 멋진 드래프트였습니다!',
    '모든 픽 종료 — 새 시즌의 그림이 완성됐습니다.',
    '드래프트 종료! 모든 팀, 정말 수고 많으셨습니다.',
  ],
  pickSecondsChanged: [
    '감독관 안내 — 픽 시간이 {seconds}초로 변경되었습니다.',
    '픽 제한 시간이 {seconds}초로 조정되었습니다. 참고해 주세요.',
    '운영 안내: 픽 시간 {seconds}초로 업데이트되었습니다.',
  ],
  readyToggledOn: [
    '{teamName} 단장님, 준비 완료 확인했습니다.',
    '{teamName} 측 READY 신호 들어왔습니다.',
    '{teamName} 준비 완료 — 카운트가 갱신됩니다.',
  ],
  readyToggledOff: [
    '{teamName} 단장님이 준비를 해제했습니다.',
    '{teamName}, READY 상태 해제되었습니다.',
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
    .replace(/\{seconds\}/g, String(ctx.seconds ?? ''))
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

/** 디버그/카운트용 — 변형 갯수 확인 */
export function lineCount(event: LineEvent): number {
  return LINES[event]?.length ?? 0
}
