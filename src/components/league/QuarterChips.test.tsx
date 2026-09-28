// 실행: JITI_JSX=1 node --test --import jiti/register src/components/league/QuarterChips.test.tsx
// (테스트 러너가 없어 jiti 로 TSX 를 즉석 변환한다)
import test from 'node:test'
import assert from 'node:assert/strict'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QuarterChips } from './QuarterChips'

// jiti 의 JSX 변환은 classic 런타임(React.createElement)이라 전역 React 가 필요하다.
// 앱 빌드(Next, react-jsx)는 영향 없음.
Object.assign(globalThis, { React })

test('「전체」 + 분기 2개가 버튼 3개로 렌더되고, 선택된 것에 aria-pressed=true', () => {
  const html = renderToStaticMarkup(
    <QuarterChips quarters={[{ id: 'q1', label: '26.1Q' }, { id: 'q2', label: '26.2Q', isCurrent: true }]} value="q2" onChange={() => {}} />
  )
  assert.equal((html.match(/<button/g) ?? []).length, 3)
  assert.match(html, /aria-pressed="true"[^>]*>[^<]*26\.2Q/)
})
