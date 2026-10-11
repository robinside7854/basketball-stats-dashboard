// Supabase 1,000행 상한을 넘겨 끝까지 읽는다 (2026-10-11).
//
// ⚠ PostgREST 는 한 번에 최대 1,000행만 준다. 상한을 넘기면 **에러 없이** 잘린다 —
//   하루 9경기 박스스코어가 뒤쪽 경기 기록 없이 그려지는 식으로, 숫자가 그럴듯해서 아무도 모른다.
// ⚠ 쿼리에 **정렬(order)을 반드시** 넣을 것. 정렬 없이 나눠 읽으면 페이지 사이에서 줄이 빠지거나 겹친다.
//
// 사용:
//   const rows = await fetchAllPaged<Row>((from, to) =>
//     sb.from('league_game_events').select('...').in('league_game_id', ids).order('id').range(from, to))

const PAGE = 1000

export async function fetchAllPaged<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = []
  for (let p = 0; ; p++) {
    const { data, error } = await page(p * PAGE, (p + 1) * PAGE - 1)
    if (error) throw new Error(error.message)
    if (data) out.push(...(data as T[]))
    if (!data || data.length < PAGE) break
  }
  return out
}
