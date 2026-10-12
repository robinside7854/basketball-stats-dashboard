'use client'
// 피드 필터(f·date·player)가 바뀌면 안쪽 브라우저를 새로 띄운다.
//
// 안쪽 브라우저(HighlightsBrowser 등)는 URL 을 처음 한 번만 읽어 상태를 만든다. 피드 모드에선
// history.replaceState 로 주소만 고치므로 서버가 다시 그리지 않는다 — 그러면 칩으로 선수를 해제해도
// 안쪽 상태에는 그 선수가 남는다. 필터 값으로 key 를 걸어 두면 바뀔 때 새로 마운트되며 주소를 다시 읽는다.
// (클립 번호·슛 유형 같은 안쪽 값은 key 에 넣지 않는다 — 클립을 넘길 때마다 재생기가 다시 뜨면 안 된다)
import { Fragment, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'

export default function FeedKeyed({ children }: { children: ReactNode }) {
  const sp = useSearchParams()
  const key = ['f', 'date', 'player'].map(k => sp.get(k) ?? '').join('|')
  return <Fragment key={key}>{children}</Fragment>
}
