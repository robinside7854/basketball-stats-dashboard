'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import { X } from 'lucide-react'

const SESSION_KEY = 'edit_mode'
const PIN_KEY = 'edit_pin'

interface EditModeCtx {
  isEditMode: boolean
  openPinModal: () => void
  exitEditMode: () => void
  teamHeaders: Record<string, string>   // 쓰기 API 에 붙일 X-Team-Pin 헤더
}

const EditModeContext = createContext<EditModeCtx>({
  isEditMode: false,
  openPinModal: () => {},
  exitEditMode: () => {},
  teamHeaders: {},
})

export function useEditMode() { return useContext(EditModeContext) }

export function EditModeProvider({ children }: { children: React.ReactNode }) {
  const [isEditMode, setIsEditMode] = useState(false)
  const [pin, setPin] = useState<string>('')
  const [showModal, setShowModal] = useState(false)
  const [digits, setDigits] = useState<string[]>([])
  // 에러를 불리언이 아니라 문구로 든다 — 오답(401)과 시도 초과 잠금(429)을 구분해 보여줘야
  // 사용자가 "왜 맞는 PIN 인데 안 되지" 하며 계속 두드리지 않는다 (2026-08-15).
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const error = errorMsg !== null
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setIsEditMode(sessionStorage.getItem(SESSION_KEY) === '1')
    setPin(sessionStorage.getItem(PIN_KEY) ?? '')
  }, [])

  // 키보드 입력 지원
  useEffect(() => {
    if (!showModal) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key >= '0' && e.key <= '9') handleDigit(e.key)
      else if (e.key === 'Backspace') handleDelete()
      else if (e.key === 'Escape') setShowModal(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showModal, digits, loading])

  function openPinModal() { setShowModal(true); setDigits([]); setErrorMsg(null) }
  function exitEditMode() {
    sessionStorage.removeItem(SESSION_KEY)
    sessionStorage.removeItem(PIN_KEY)
    setIsEditMode(false)
    setPin('')
  }

  async function handleDigit(d: string) {
    if (loading || digits.length >= 4) return
    const next = [...digits, d]
    setDigits(next)
    setErrorMsg(null)
    if (next.length < 4) return

    setLoading(true)
    try {
      // URL: /[org]/[team]/... 구조에서 org, team 추출
      const segments = window.location.pathname.split('/').filter(Boolean)
      const org = segments[0] ?? 'paranalgae'
      const team = segments[1] ?? undefined
      const res = await fetch('/api/auth/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: next.join(''), org, team }),
      })
      if (res.ok) {
        const entered = next.join('')
        sessionStorage.setItem(SESSION_KEY, '1')
        sessionStorage.setItem(PIN_KEY, entered)
        setPin(entered)
        setIsEditMode(true)
        setShowModal(false)
      } else {
        // 429 = 시도 횟수 초과. 서버가 남은 잠금 시간을 담은 문구를 준다.
        const payload = res.status === 429 ? await res.json().catch(() => null) : null
        setErrorMsg(
          (payload as { error?: string } | null)?.error ?? 'PIN이 올바르지 않습니다'
        )
        setDigits([])
      }
    } finally {
      setLoading(false)
    }
  }

  function handleDelete() { setDigits(prev => prev.slice(0, -1)); setErrorMsg(null) }

  const PAD = ['1','2','3','4','5','6','7','8','9','','0','⌫']

  return (
    <EditModeContext.Provider
      value={{ isEditMode, openPinModal, exitEditMode, teamHeaders: pin ? { 'X-Team-Pin': pin } : {} }}
    >
      {children}

      {showModal && (
        <div className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div className="relative bg-gray-900 border border-gray-700 rounded-2xl p-8 flex flex-col items-center gap-6 shadow-2xl w-full max-w-sm">
            {/* p-3 -m-3 — 아이콘(20px)은 그대로 두고 터치 영역만 44×44 로 넓힌다.
                음수 마진이 패딩만큼 되돌려서 버튼이 보이는 위치는 안 밀린다. */}
            <button
              onClick={() => setShowModal(false)}
              aria-label="닫기"
              className="absolute top-4 right-4 p-3 -m-3 text-gray-500 hover:text-white transition-colors duration-200 cursor-pointer"
            ><X size={20} /></button>

            <div className="text-center">
              <div className="text-xl font-bold mb-1">편집 모드 전환</div>
              <div className="text-gray-400 text-sm">PIN 번호를 입력하세요</div>
            </div>

            <div className="flex gap-4">
              {[0,1,2,3].map(i => (
                <div key={i} className={`w-4 h-4 rounded-full border-2 transition-colors
                  ${error ? 'border-red-500 bg-red-500' : digits[i] !== undefined ? 'border-blue-400 bg-blue-400' : 'border-gray-600 bg-transparent'}`}
                />
              ))}
            </div>
            {error && <p role="alert" className="text-red-400 text-sm -mt-2 text-center px-2">{errorMsg}</p>}

            <div className="grid grid-cols-3 gap-3">
              {PAD.map((key, i) => (
                key === '' ? <div key={i} /> :
                key === '⌫' ? (
                  <button key={i} onClick={handleDelete}
                    className="w-16 h-16 rounded-2xl bg-gray-800 text-gray-300 text-xl font-medium hover:bg-gray-700 active:scale-95 transition-all">
                    {key}
                  </button>
                ) : (
                  <button key={i} onClick={() => handleDigit(key)} disabled={digits.length >= 4 || loading}
                    className="w-16 h-16 rounded-2xl bg-gray-800 text-white text-2xl font-bold hover:bg-gray-700 active:scale-95 transition-all disabled:opacity-40">
                    {key}
                  </button>
                )
              ))}
            </div>
          </div>
        </div>
      )}
    </EditModeContext.Provider>
  )
}
