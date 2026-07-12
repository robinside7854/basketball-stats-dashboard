'use client'

import { Toaster } from 'sonner'
import { useTheme } from 'next-themes'

/**
 * ThemeProvider(next-themes) 와 sonner Toaster 를 동기화하는 클라이언트 wrapper.
 * layout.tsx 는 Server Component 라 useTheme 를 직접 쓸 수 없어 분리했다.
 *
 * 위치·리치컬러 등 정책은 기존 layout.tsx 설정을 그대로 이관.
 * theme 만 하드코딩('dark') 대신 ThemeProvider 상태를 따르도록 변경.
 */
export default function ThemedToaster() {
  const { resolvedTheme } = useTheme()
  const theme: 'light' | 'dark' | 'system' =
    resolvedTheme === 'light' ? 'light' : resolvedTheme === 'dark' ? 'dark' : 'system'

  return (
    <Toaster
      position="top-center"
      richColors
      closeButton
      expand={false}
      offset="72px"
      theme={theme}
    />
  )
}
