// 실행: node --test --import jiti/register src/lib/stats/nbaComps.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { NBA_POOL, NBA_POSITIONS, matchNbaComps, shotMix } from './nbaComps'

test('풀은 100명 안팎, 이름 중복 없음, 6축 0~100', () => {
  assert.ok(NBA_POOL.length >= 95 && NBA_POOL.length <= 110, `풀 ${NBA_POOL.length}명`)
  assert.equal(new Set(NBA_POOL.map(p => p.name)).size, NBA_POOL.length)
  for (const p of NBA_POOL) {
    assert.equal(p.axes.length, 6, p.name)
    for (const v of p.axes) assert.ok(v >= 0 && v <= 100, `${p.name} ${v}`)
  }
  assert.ok(NBA_POOL.some(p => p.legend) && NBA_POOL.some(p => !p.legend))
})

test('리바·수비가 튀고 슈팅이 낮으면 빅맨/수비형이 나온다', () => {
  const r = matchNbaComps([35, 95, 97, 5, 20, 70])
  assert.equal(r.length, 3)
  const names = r.map(m => m.comp.name)
  assert.ok(names.some(n => ['루디 고베어', '벤 월러스', '드와이트 하워드', '데니스 로드맨', '빌 러셀', '클린트 카펠라', '마커스 캠비'].includes(n)), names.join(','))
  assert.ok(r[0].strengths.includes('리바운드') || r[0].strengths.includes('수비'))
})

test('슈팅·리딩형 가드는 슈터·패서가 나온다', () => {
  const names = matchNbaComps([85, 40, 25, 95, 85, 85]).map(m => m.comp.name)
  assert.ok(names.some(n => ['스테판 커리', '스티브 내시', '데미안 릴라드', '타이리스 할리버튼', '채운시 빌럽스'].includes(n)), names.join(','))
})

test('비교 가능한 축이 4개 미만이면 빈 배열, 점수는 내림차순', () => {
  assert.deepEqual(matchNbaComps([50, null, null, null, 50, 50]), [])
  const r = matchNbaComps([60, 60, 60, 60, 60, null])
  assert.ok(r[0].score >= r[1].score && r[1].score >= r[2].score)
})

test('슛 분포는 109명 모두 합 100', () => {
  for (const p of NBA_POOL) assert.equal(p.shots.reduce((s, v) => s + v, 0), 100, p.name)
})

test('같은 6축이라도 슛 분포가 돌파형이면 돌파형, 포스트형이면 포스트형이 앞선다', () => {
  const axes = [90, 70, 85, 10, 40, 88]
  const drive = matchNbaComps(axes, 3, undefined, shotMix([60, 20, 15, 5])).map(m => m.comp.name)
  const post = matchNbaComps(axes, 3, undefined, shotMix([10, 70, 20, 0])).map(m => m.comp.name)
  assert.notDeepEqual(drive, post)
  assert.ok(post.some(n => ['샤킬 오닐', '카림 압둘자바', '하킴 올라주원', '팀 던컨', '윌트 체임벌린', '야오밍', '찰스 바클리', '칼 말론', '파우 가솔'].includes(n)), post.join(','))
})

test('야투가 적으면 슛 분포를 쓰지 않는다', () => {
  assert.equal(shotMix([3, 2, 1, 4]), null)
  assert.ok(shotMix([30, 10, 20, 40]))
})

test('포지션을 주면 그 포지션 NBA 선수만 나온다', () => {
  const axes = [85, 40, 25, 95, 85, 85]
  for (const g of ['G', 'F', 'C'] as const) {
    const r = matchNbaComps(axes, 3, undefined, null, g)
    assert.equal(r.length, 3)
    for (const m of r) assert.ok(NBA_POSITIONS[m.comp.name].includes(g), `${g} ${m.comp.name}`)
  }
  for (const p of NBA_POOL) assert.ok(/^(G|F|C|GF|FC)$/.test(NBA_POSITIONS[p.name] ?? ''), p.name)
})
