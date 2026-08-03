// 공지 본문 마크다운 ↔ HTML 유틸
//
// 배경: 공지 편집기는 TipTap(WYSIWYG)이고 저장 포맷은 HTML 이다.
// TipTap 은 붙여넣기 시 `**굵게**` 같은 *인라인* 입력 규칙만 처리하고
// `##`(헤딩) · `- `(리스트) · `---`(구분선) 같은 *블록* 문법은 이해하지 못해
// `<p>## 제목</p>` 처럼 리터럴로 감싸 저장해 버린다.
// 그 결과 리더에서 마크다운 기호가 그대로 노출된다.
//
// 여기서는 두 가지를 제공한다:
//   1) looksLikeBlockMarkdown — 블록 문법 존재 여부 감지
//   2) markdownToHtml         — marked 로 변환
//   3) repairFlattenedMarkdown — 이미 <p> 로 납작해진 본문 복구
import { marked } from 'marked'

/** 줄 시작 기준 블록 마크다운 문법 (헤딩·리스트·인용·구분선·표·코드펜스) */
const BLOCK_MD = /^[ \t]{0,3}(#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s|(-{3,}|\*{3,}|_{3,})\s*$|\||```)/m

export function looksLikeBlockMarkdown(text: string): boolean {
  return BLOCK_MD.test(text)
}

export function markdownToHtml(source: string): string {
  try {
    return marked.parse(source, { async: false, gfm: true, breaks: true }) as string
  } catch {
    return source
  }
}

/**
 * `<p>## 제목</p><p>- 항목</p>` 처럼 블록 마크다운이 문단으로 납작해진 HTML 복구.
 *
 * 블록 태그를 개행으로 되돌린 뒤 마크다운으로 재파싱한다.
 * `<strong>` · `<a>` 같은 인라인 태그는 그대로 남겨 두면 marked 가 통과시키므로
 * 붙여넣기 때 이미 살아난 굵게/링크 서식은 보존된다.
 */
export function repairFlattenedMarkdown(html: string): string {
  const text = html
    // 문단·줄바꿈 경계를 개행으로 — </p><p> 는 문단 구분이므로 빈 줄 하나로
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
    .replace(/<\/?p[^>]*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/&nbsp;/gi, ' ')
    // 엔티티 되돌리기 — 마크다운 기호가 엔티티로 저장된 경우 대비
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  // `본문\n---` 은 마크다운에서 setext 헤딩(H2)으로 해석된다.
  // 구분선 의도가 뒤집히지 않도록 앞뒤로 빈 줄을 보장한다.
  const guarded = text.replace(/\n(-{3,}|\*{3,}|_{3,})[ \t]*(?=\n|$)/g, '\n\n$1\n')

  return markdownToHtml(guarded)
}
