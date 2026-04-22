'use client'
import { createContext, useContext, useEffect, useState } from 'react'

interface LeagueEditModeCtx {
  isEditMode: boolean
  leagueHeaders: Record<string, string>
  openPinModal: () => void
  exitEditMode: () => void
}

const LeagueEditModeContext = createContext<LeagueEditModeCtx>({
  isEditMode: false,
  leagueHeaders: {},
  openPinModal: () => {},
  exitEditMode: () => {},
})

export function useLeagueEditMode() { return useContext(LeagueEditModeContext) }

export function LeagueEditModeProvider({
  children,
  leagueId,
}: {
  children: React.ReactNode
  leagueId: string
}) {
  const SESSION_KEY = `league_edit_${leagueId}`
  const [isEditMode, setIsEditMode] = useState(false)
  const [pin, setPin] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [digits, setDigits] = useState<string[]>([])
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const stored = sessionStorage.getItem(SESSION_KEY)
    if (stored) { setIsEditMode(true); setPin(stored) }
  }, [SESSION_KEY])

  useEffect(() => {
    if (!showModal) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key >= '0' && e.key <= '9') handleDigit(e.key)
      else if (e.key === 'Backspace') handleDelete()
      else if (e.key === 'Escape') setShowModal(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showModal, digits, loading])

  function openPinModal() { setShowModal(true); setDigits([]); setError(false) }

  function exitEditMode() {
    sessionStorage.removeItem(SESSION_KEY)
    setIsEditMode(false)
    setPin('')
  }

  async function handleDigit(d: string) {
    if (loading || digits.length >= 4) return
    const next = [...digits, d]
    setDigits(next)
    setError(false)
    if (next.length < 4) return

    setLoading(true)
    try {
      const res = await fetch('/api/auth/league-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leagueId, pin: next.join('') }),
      })
      if (res.ok) {
        const verifiedPin = next.join('')
        sessionStorage.setItem(SESSION_KEY, verifiedPin)
        setPin(verifiedPin)
        setIsEditMode(true)
        setShowModal(false)
      } else {
        setError(true)
        setDigits([])
      }
    } finally {
      setLoading(false)
    }
  }

  function handleDelete() { setDigits(prev => prev.slice(0, -1)); setError(false) }

  const PAD = ['1','2','3','4','5','6','7','8','9','','0','⌫']

  const leagueHeaders: Record<string, string> = isEditMode
    ? { 'Content-Type': 'application/json', 'X-League-Pin': pin }
    : { 'Content-Type': 'application/json' }

  return (
    <LeagueEditModeContext.Provider value={{ isEditMode, leagueHeaders, openPinModal, exitEditMode }}>
      {children}

      {showModal && (
        <div className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="relative bg-gray-900 border border-gray-700 rounded-2xl p-8 flex flex-col items-center gap-6 shadow-2xl w-full max-w-sm">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 text-gray-500 hover:text-white text-lg leading-none cursor-pointer"
            >✕</button>

            <div className="text-center">
              <div className="text-xl font-bold text-white mb-1">편집 모드 전환</div>
              <div className="text-gray-400 text-sm">리그 PIN 번호를 입력하세요</div>
            </div>

            <div className="flex gap-4">
              {[0,1,2,3].map(i => (
                <div key={i} className={`w-4 h-4 rounded-full border-2 transition-colors
                  ${error ? 'border-red-500 bg-red-500' : digits[i] !== undefined ? 'border-blue-400 bg-blue-400' : 'border-gray-600 bg-transparent'}`}
                />
              ))}
            </div>
            {error && <p className="text-red-400 text-sm -mt-2">PIN이 올바르지 않습니다</p>}

            <div className="grid grid-cols-3 gap-3">
              {PAD.map((key, i) => (
                key === '' ? <div key={i} /> :
                key === '⌫' ? (
                  <button key={i} onClick={handleDelete}
                    className="w-16 h-16 rounded-2xl bg-gray-800 text-gray-300 text-xl font-medium hover:bg-gray-700 active:scale-95 transition-all cursor-pointer">
                    {key}
                  </button>
                ) : (
                  <button key={i} onClick={() => handleDigit(key)} disabled={digits.length >= 4 || loading}
                    className="w-16 h-16 rounded-2xl bg-gray-800 text-white text-2xl font-bold hover:bg-gray-700 active:scale-95 transition-all disabled:opacity-40 cursor-pointer">
                    {key}
                  </button>
                )
              ))}
            </div>
          </div>
        </div>
      )}
    </LeagueEditModeContext.Provider>
  )
}
