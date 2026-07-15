'use client'
// TipTap 기반 WYSIWYG 에디터 · 마크다운 대신 실제 서식이 보이는 편집
// 저장은 HTML 문자열 · 리더(ReactMarkdown+rehypeRaw)가 HTML 그대로 렌더 → 기존 마크다운 데이터도 호환
// UNDO/REDO는 TipTap History extension 내장 (Ctrl+Z / Ctrl+Shift+Z 자동)

import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import { useEffect, useRef, useState } from 'react'
import {
  Bold, Italic, Underline as UnderlineIcon, Heading1, Heading2, Heading3,
  List, ListOrdered, Quote, Code, Link2 as LinkIcon, Minus, Highlighter,
  Palette, Undo2, Redo2, Strikethrough, Image as ImageIcon, MapPin,
} from 'lucide-react'
import InternalLinkPicker from './InternalLinkPicker'

interface Props {
  initialHtml: string
  onChange: (html: string) => void
  onPasteImage?: (file: File) => Promise<string | null>   // 업로드 후 URL 반환
  leagueBase?: string       // 내부 링크 픽커 활성화용 (`/league/[org]/[id]`)
  placeholder?: string
}

const COLORS: { label: string; hex: string }[] = [
  { label: '기본', hex: '' },
  { label: '빨강', hex: '#DC2626' },
  { label: '주황', hex: '#EA580C' },
  { label: '노랑', hex: '#CA8A04' },
  { label: '녹색', hex: '#059669' },
  { label: '파랑', hex: '#2563EB' },
  { label: '보라', hex: '#7C3AED' },
  { label: '회색', hex: '#6B7280' },
]

export default function RichEditor({ initialHtml, onChange, onPasteImage, leagueBase, placeholder }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
      Image.configure({ inline: false, allowBase64: false }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: false }),
    ],
    content: initialHtml || '<p></p>',
    editorProps: {
      attributes: {
        class: 'announcement-prose tiptap-editor focus:outline-none min-h-[300px] px-4 py-3',
      },
      handlePaste: (view, event) => {
        // 이미지 붙여넣기 → 업로드 콜백 호출 (에디터 외부에서 처리)
        const items = Array.from(event.clipboardData?.items ?? []).filter(it => it.type.startsWith('image/'))
        if (items.length === 0 || !onPasteImage) return false
        event.preventDefault()
        ;(async () => {
          for (const it of items) {
            const file = it.getAsFile()
            if (!file) continue
            const url = await onPasteImage(file)
            if (url && editorRef.current) editorRef.current.chain().focus().setImage({ src: url, alt: '스크린샷' }).run()
          }
        })()
        return true
      },
      handleDrop: (view, event) => {
        const files = Array.from(event.dataTransfer?.files ?? []).filter(f => f.type.startsWith('image/'))
        if (files.length === 0 || !onPasteImage) return false
        event.preventDefault()
        ;(async () => {
          for (const f of files) {
            const url = await onPasteImage(f)
            if (url && editorRef.current) editorRef.current.chain().focus().setImage({ src: url, alt: '스크린샷' }).run()
          }
        })()
        return true
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    immediatelyRender: false,
  })

  const editorRef = useRef<Editor | null>(null)
  useEffect(() => { editorRef.current = editor ?? null }, [editor])

  // initialHtml 이 변경될 때 (수정 진입 등) 에디터 컨텐츠 교체
  useEffect(() => {
    if (!editor) return
    const current = editor.getHTML()
    if (current === initialHtml) return
    editor.commands.setContent(initialHtml || '<p></p>', { emitUpdate: false })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialHtml, editor])

  if (!editor) {
    return <div className="min-h-[300px] px-4 py-3 text-sm" style={{ color: 'var(--mm-muted)' }}>에디터 로딩…</div>
  }

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <RichEditorToolbar editor={editor} leagueBase={leagueBase} onImagePick={onPasteImage} />
      <div className="flex-1 overflow-y-auto" style={{ background: 'var(--mm-panel)', minHeight: 0 }}>
        <EditorContent editor={editor} />
        {editor.isEmpty && placeholder && (
          <div className="px-4 -mt-[280px] pointer-events-none text-sm" style={{ color: 'var(--mm-muted)' }}>
            {placeholder}
          </div>
        )}
      </div>
    </div>
  )
}

// 툴바 컴포넌트 · TipTap editor 명령 직접 호출
function RichEditorToolbar({
  editor,
  leagueBase,
  onImagePick,
}: {
  editor: Editor
  leagueBase?: string
  onImagePick?: (file: File) => Promise<string | null>
}) {
  const [colorOpen, setColorOpen] = useState(false)
  const [linkPickerOpen, setLinkPickerOpen] = useState(false)
  const colorRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!colorOpen) return
    const onDoc = (e: MouseEvent) => {
      if (colorRef.current && !colorRef.current.contains(e.target as Node)) setColorOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [colorOpen])

  const btn = (title: string, active: boolean, disabled: boolean, onClick: () => void, Icon: typeof Bold) => (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}   // 포커스 유지
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-sm cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        background: active ? 'var(--mm-yellow)' : 'transparent',
        color: active ? 'var(--mm-black)' : 'var(--mm-ink-soft)',
        border: `1px solid ${active ? 'var(--mm-yellow-strong)' : 'transparent'}`,
      }}
    >
      <Icon size={14} aria-hidden />
    </button>
  )

  const divider = <span aria-hidden className="w-px h-5 mx-0.5" style={{ background: 'var(--mm-rule)' }} />

  const insertLinkExternal = () => {
    const prev = editor.getAttributes('link').href ?? ''
    const url = window.prompt('URL 을 입력하세요 (빈 값이면 링크 해제)', prev)
    if (url === null) return
    if (url === '') { editor.chain().focus().extendMarkRange('link').unsetLink().run(); return }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f || !onImagePick) return
    const url = await onImagePick(f)
    if (url) editor.chain().focus().setImage({ src: url, alt: '이미지' }).run()
  }

  return (
    <div
      className="flex items-center gap-0.5 flex-wrap px-2 py-1.5 min-h-[44px] shrink-0"
      style={{ background: 'var(--mm-panel-alt)', borderBottom: '1px solid var(--mm-rule)' }}
      role="toolbar"
      aria-label="서식"
    >
      {/* 실행취소/재실행 */}
      {btn('실행 취소 (Ctrl+Z)', false, !editor.can().undo(), () => editor.chain().focus().undo().run(), Undo2)}
      {btn('다시 실행 (Ctrl+Shift+Z)', false, !editor.can().redo(), () => editor.chain().focus().redo().run(), Redo2)}
      {divider}
      {/* 헤딩 */}
      {btn('제목 1', editor.isActive('heading', { level: 1 }), false, () => editor.chain().focus().toggleHeading({ level: 1 }).run(), Heading1)}
      {btn('제목 2', editor.isActive('heading', { level: 2 }), false, () => editor.chain().focus().toggleHeading({ level: 2 }).run(), Heading2)}
      {btn('제목 3', editor.isActive('heading', { level: 3 }), false, () => editor.chain().focus().toggleHeading({ level: 3 }).run(), Heading3)}
      {divider}
      {/* 인라인 서식 */}
      {btn('굵게 (Ctrl+B)', editor.isActive('bold'), false, () => editor.chain().focus().toggleBold().run(), Bold)}
      {btn('기울임 (Ctrl+I)', editor.isActive('italic'), false, () => editor.chain().focus().toggleItalic().run(), Italic)}
      {btn('밑줄 (Ctrl+U)', editor.isActive('underline'), false, () => editor.chain().focus().toggleUnderline().run(), UnderlineIcon)}
      {btn('취소선', editor.isActive('strike'), false, () => editor.chain().focus().toggleStrike().run(), Strikethrough)}
      {btn('형광펜', editor.isActive('highlight'), false, () => editor.chain().focus().toggleHighlight().run(), Highlighter)}

      {/* 색상 팔레트 */}
      <div ref={colorRef} className="relative">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setColorOpen(v => !v)}
          title="글자 색"
          aria-label="글자 색"
          aria-expanded={colorOpen}
          className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-sm cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)]"
          style={{ color: 'var(--mm-ink-soft)', border: '1px solid transparent' }}
        >
          <Palette size={14} aria-hidden />
        </button>
        {colorOpen && (
          <div
            className="absolute z-30 top-full left-0 mt-1 p-2 rounded-sm shadow-lg"
            style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', minWidth: 180 }}
          >
            <div className="text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: 'var(--mm-muted)' }}>글자 색</div>
            <div className="grid grid-cols-4 gap-1.5">
              {COLORS.map(c => (
                <button
                  key={c.label}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setColorOpen(false)
                    if (c.hex) editor.chain().focus().setColor(c.hex).run()
                    else editor.chain().focus().unsetColor().run()
                  }}
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
      {/* 리스트/인용/코드 */}
      {btn('글머리표', editor.isActive('bulletList'), false, () => editor.chain().focus().toggleBulletList().run(), List)}
      {btn('번호 목록', editor.isActive('orderedList'), false, () => editor.chain().focus().toggleOrderedList().run(), ListOrdered)}
      {btn('인용문', editor.isActive('blockquote'), false, () => editor.chain().focus().toggleBlockquote().run(), Quote)}
      {btn('코드', editor.isActive('code'), false, () => editor.chain().focus().toggleCode().run(), Code)}

      {divider}
      {/* 링크 · 구분선 · 이미지 */}
      {btn('외부 링크', editor.isActive('link'), false, insertLinkExternal, LinkIcon)}
      {leagueBase && btn('페이지 링크 (내부)', false, false, () => setLinkPickerOpen(true), MapPin)}
      {btn('구분선', false, false, () => editor.chain().focus().setHorizontalRule().run(), Minus)}
      {onImagePick && (
        <label
          className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-sm cursor-pointer transition-colors hover:bg-[color:var(--mm-panel-alt)]"
          style={{ color: 'var(--mm-ink-soft)', border: '1px solid transparent' }}
          title="이미지 첨부"
          aria-label="이미지 첨부"
        >
          <ImageIcon size={14} aria-hidden />
          <input type="file" accept="image/*" onChange={handleFilePick} className="hidden" />
        </label>
      )}

      {linkPickerOpen && leagueBase && (
        <InternalLinkPicker
          leagueBase={leagueBase}
          onPick={({ label, href }) => {
            setLinkPickerOpen(false)
            editor.chain().focus().extendMarkRange('link').insertContent({
              type: 'text',
              text: label,
              marks: [{ type: 'link', attrs: { href } }],
            }).run()
          }}
          onClose={() => setLinkPickerOpen(false)}
        />
      )}
    </div>
  )
}
