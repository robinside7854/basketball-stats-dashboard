'use client'

import { useEffect } from 'react'

/**
 * 루트 error boundary — App Router 규격 (Client Component).
 * 예상치 못한 예외를 미라클모닝 톤으로 안내하고 재시도 버튼 제공.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // 콘솔 로깅 — Vercel 로그·개발자 도구에서 추적 가능
    console.error('[root error boundary]', error)
  }, [error])

  return (
    <div
      className="flex min-h-screen w-full flex-col items-center justify-center gap-6 px-6 text-center"
      style={{ backgroundColor: 'var(--mm-ground)', color: 'var(--mm-ink)' }}
      role="alert"
    >
      <div className="flex flex-col items-center gap-3">
        <p
          className="font-jersey text-xs uppercase tracking-[0.22em]"
          style={{ color: 'var(--mm-yellow-strong)' }}
        >
          Error
        </p>
        <h1 className="font-jersey text-3xl font-black uppercase md:text-4xl">
          잠시 문제가 발생했어요
        </h1>
        <p
          className="max-w-md text-sm leading-relaxed"
          style={{ color: 'var(--mm-ink-soft)' }}
        >
          예기치 못한 오류로 화면을 표시할 수 없습니다. 새로고침을 시도하거나
          잠시 후 다시 접속해 주세요.
        </p>
        {error.digest && (
          <p
            className="mt-1 font-mono text-[11px] uppercase tracking-widest"
            style={{ color: 'var(--mm-muted)' }}
          >
            digest: {error.digest}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="cursor-pointer font-jersey text-sm font-black uppercase tracking-[0.16em] px-5 py-3 transition-colors duration-200"
          style={{
            backgroundColor: 'var(--mm-yellow)',
            color: 'var(--mm-black)',
          }}
        >
          다시 시도
        </button>
        <button
          type="button"
          onClick={() => {
            if (typeof window !== 'undefined') window.location.reload()
          }}
          className="cursor-pointer font-jersey text-sm font-black uppercase tracking-[0.16em] px-5 py-3 border transition-colors duration-200"
          style={{
            borderColor: 'var(--mm-rule)',
            color: 'var(--mm-ink)',
          }}
        >
          새로고침
        </button>
      </div>
    </div>
  )
}
