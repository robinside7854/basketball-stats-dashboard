'use client'
// 마크다운 편집기용 서식 툴바 · textarea 를 참조받아 선택 영역/커서 위치에 삽입
// 마크다운 기본 문법 + HTML(u, mark, span color) 은 rehype-raw 로 렌더링됨
import { useState, useRef, useEffect } from 'react'
import {
  Bold, Italic, Underline, Heading1, Heading2, Heading3,
  List, ListOrdered, Quote, Code, Link2, Minus, Highlighter, Palette,
} from 'lucide-react'

interface Props {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  value: string
  onChange: (v: string) => void
}

// 편집기 색상 팔레트 (mm-* 팔레트 기반 · 접근성 대비 고려)
const COLORS: { label: string; hex: string }[] = [
  { label: '기본', hex: '' },
  { label: '빨강', hex: '#DC2626' },
  { label: '주황', hex: '#EA580C' },
  { label: '노랑', hex: '#CA8A04' },   // 배경이 아닌 텍스트 컬러라 살짝 어둡게
  { label: '녹색', hex: '#059669' },
  { label: '파랑', hex: '#2563EB' },
  { label: '보라', hex: '#7C3AED' },
  { label: '회색', hex: '#6B7280' },
]

export default function FormatToolbar({ textareaRef, value, onChange }: Props) {
  const [colorOpen, setColorOpen] = useState(false)
  const colorRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!colorOpen) return
    const onDoc = (e: MouseEvent) => {
      if (colorRef.current && !colorRef.current.contains(e.target as Node)) setColorOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [colorOpen])

  // 선택 영역 감싸기 · 없으면 커서 위치에 삽입 (선택 텍스트 또는 placeholder 사용)
  const wrap = (prefix: string, suffix: string, placeholder = '텍스트') => {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const selected = value.slice(start, end) || placeholder
    const inserted = `${prefix}${selected}${suffix}`
    const next = value.slice(0, start) + inserted + value.slice(end)
    onChange(next)
    setTimeout(() => {
      ta.focus()
      const cursorStart = start + prefix.length
      const cursorEnd = cursorStart + selected.length
      ta.setSelectionRange(cursorStart, cursorEnd)
    }, 0)
  }

  // 라인 앞에 prefix 삽입 (헤딩/리스트/인용용)
  const lineWrap = (prefix: string, placeholder = '텍스트') => {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    // 현재 라인 시작 위치 찾기
    const lineStart = value.lastIndexOf('\n', start - 1) + 1
    const selected = value.slice(start, end)
    // 선택이 있으면 라인 시작에 prefix 삽입 · 없으면 빈 라인
    if (selected) {
      const before = value.slice(0, lineStart)
      const after = value.slice(lineStart)
      const next = before + prefix + after
      onChange(next)
      setTimeout(() => {
        ta.focus()
        ta.setSelectionRange(start + prefix.length, end + prefix.length)
      }, 0)
    } else {
      const needsNl = start > 0 && value[start - 1] !== '\n'
      const inserted = (needsNl ? '\n' : '') + prefix + placeholder
      const next = value.slice(0, start) + inserted + value.slice(start)
      onChange(next)
      setTimeout(() => {
        ta.focus()
        const cursorStart = start + (needsNl ? 1 : 0) + prefix.length
        ta.setSelectionRange(cursorStart, cursorStart + placeholder.length)
      }, 0)
    }
  }

  const insertLink = () => {
    const url = window.prompt('URL 을 입력하세요', 'https://')
    if (!url) return
    wrap('[', `](${url})`, '링크 텍스트')
  }

  const insertHr = () => {
    const ta = textareaRef.current
    if (!ta) return
    const pos = ta.selectionStart
    const before = value.slice(0, pos)
    const after = value.slice(pos)
    const prefix = before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n'
    const suffix = after.startsWith('\n') ? '\n' : '\n\n'
    const inserted = `${prefix}---${suffix}`
    onChange(before + inserted + after)
    setTimeout(() => {
      ta.focus()
      const p = pos + inserted.length
      ta.setSelectionRange(p, p)
    }, 0)
  }

  const applyColor = (hex: string) => {
    setColorOpen(false)
    if (!hex) {
      // "기본" 선택: 선택 영역이 <span style="color:...">…</span> 인지 감지해 벗겨내는 것도 가능하지만,
      // 유저가 커서 위치에 새 span 을 삽입하지 않도록 no-op 처리 (편집기에서 직접 지우면 됨)
      return
    }
    wrap(`<span style="color:${hex}">`, '</span>', '텍스트')
  }

  const btn = (title: string, onClick: () => void, Icon: typeof Bold) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-sm cursor-pointer transition-colors hover:bg-[color:var(--mm-panel-alt)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)]"
      style={{ color: 'var(--mm-ink-soft)', border: '1px solid transparent' }}
    >
      <Icon size={14} aria-hidden />
    </button>
  )

  const divider = <span aria-hidden className="w-px h-5 mx-0.5" style={{ background: 'var(--mm-rule)' }} />

  return (
    <div
      className="flex items-center gap-0.5 flex-wrap px-2 py-1.5 min-h-[44px]"
      style={{ background: 'var(--mm-panel)', borderBottom: '1px solid var(--mm-rule)' }}
      role="toolbar"
      aria-label="서식"
    >
      {btn('제목 1 (H1)', () => lineWrap('# ', '큰 제목'), Heading1)}
      {btn('제목 2 (H2)', () => lineWrap('## ', '중간 제목'), Heading2)}
      {btn('제목 3 (H3)', () => lineWrap('### ', '작은 제목'), Heading3)}
      {divider}
      {btn('굵게 (Ctrl+B)', () => wrap('**', '**'), Bold)}
      {btn('기울임', () => wrap('*', '*'), Italic)}
      {btn('밑줄', () => wrap('<u>', '</u>'), Underline)}
      {btn('형광펜', () => wrap('<mark>', '</mark>'), Highlighter)}
      {/* 색상 팔레트 */}
      <div ref={colorRef} className="relative">
        <button
          type="button"
          onClick={() => setColorOpen(v => !v)}
          title="글자 색"
          aria-label="글자 색"
          aria-expanded={colorOpen}
          className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-sm cursor-pointer transition-colors hover:bg-[color:var(--mm-panel-alt)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)]"
          style={{ color: 'var(--mm-ink-soft)', border: '1px solid transparent' }}
        >
          <Palette size={14} aria-hidden />
        </button>
        {colorOpen && (
          <div
            className="absolute z-20 top-full left-0 mt-1 p-2 rounded-sm shadow-lg"
            style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', minWidth: 180 }}
          >
            <div className="text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: 'var(--mm-muted)' }}>
              글자 색
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {COLORS.map(c => (
                <button
                  key={c.label}
                  type="button"
                  onClick={() => applyColor(c.hex)}
                  title={c.label}
                  aria-label={c.label}
                  className="w-10 h-10 rounded-sm cursor-pointer transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] inline-flex items-center justify-center text-xs font-black"
                  style={{
                    background: c.hex || 'var(--mm-panel-alt)',
                    color: c.hex ? 'white' : 'var(--mm-ink)',
                    border: `1px solid ${c.hex || 'var(--mm-rule)'}`,
                  }}
                >
                  {c.hex ? 'A' : '기본'}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      {divider}
      {btn('글머리표', () => lineWrap('- ', '항목'), List)}
      {btn('번호 목록', () => lineWrap('1. ', '항목'), ListOrdered)}
      {btn('인용문', () => lineWrap('> ', '인용 텍스트'), Quote)}
      {btn('코드', () => wrap('`', '`', '코드'), Code)}
      {divider}
      {btn('링크', insertLink, Link2)}
      {btn('구분선', insertHr, Minus)}
    </div>
  )
}
