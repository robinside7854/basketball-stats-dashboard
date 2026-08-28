'use client'
// 리그 편집 모드 — 두 경로로 켜진다 (2026-08-04 전환):
//   1) 로그인 회원의 role='admin'  ← 주 경로. 쿠키(mm_auth) 기반이라 별도 입력이 없다.
//   2) 리그 편집 PIN               ← 전환기 폴백. 어드민 지정이 자리잡으면 제거 예정.
// 어느 쪽이든 isEditMode 는 UI 노출 판단일 뿐이고, 실제 인가는 서버의 canEditLeague 가
// 매 요청 DB 에서 재확인한다 (src/lib/auth/leagueAdmin.ts).
import { createContext, useContext, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useCurrentUser } from '@/contexts/LeagueAuthContext'

interface LeagueEditModeCtx {
  isEditMode: boolean
  // 권한 확인 완료 여부 (로그인 상태 조회 + sessionStorage 로드 둘 다 끝난 시점).
  //   /settings 등 서버가드가 필요한 페이지가 "확인 완료 후 미인증"을 판별하기 위해 사용.
  //   초기 렌더 시 isEditMode=false 이지만 확인 후 true 로 바뀔 수 있으므로,
  //   redirect 결정은 반드시 isInitialized=true 인 이후에만 수행할 것.
  isInitialized: boolean
  // 어드민 role 로 켜진 편집 모드인지 (PIN 폴백과 구분 — 설정 화면 안내 문구용).
  isAdminSession: boolean
  leagueHeaders: Record<string, string>
  openPinModal: () => void
  exitEditMode: () => void
  // PIN 변경 성공 직후 세션에 실린 PIN 도 함께 갱신한다 (설정 화면 savePin 이 호출).
  //   갱신하지 않으면 leagueHeaders 가 계속 옛 PIN 을 실어 보내 이후 모든 편집 요청이
  //   403 으로 조용히 실패한다 — 화면은 여전히 편집 모드로 보이는데 아무 저장도 안 먹는다.
  //   어드민 role 경로(PIN 미사용)에서는 아무 효과가 없다 — pinVerified 가 아니면 no-op.
  updateStoredPin: (newPin: string) => void
}

const LeagueEditModeContext = createContext<LeagueEditModeCtx>({
  isEditMode: false,
  isInitialized: false,
  isAdminSession: false,
  leagueHeaders: {},
  openPinModal: () => {},
  exitEditMode: () => {},
  updateStoredPin: () => {},
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
  // PIN 폴백 경로의 상태. 어드민 role 경로는 아래 useCurrentUser() 에서 온다.
  const [pinVerified, setPinVerified] = useState(false)
  const [storageLoaded, setStorageLoaded] = useState(false)
  const [pin, setPin] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [digits, setDigits] = useState<string[]>([])
  // 에러를 불리언이 아니라 문구로 든다 — 오답(401)과 시도 초과 잠금(429)을 구분해 보여줘야
  // 사용자가 "왜 맞는 PIN 인데 안 되지" 하며 계속 두드리지 않는다 (2026-08-15).
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const error = errorMsg !== null
  const [loading, setLoading] = useState(false)

  const { user, loading: authLoading } = useCurrentUser()
  const isAdminSession = user?.role === 'admin'

  // 편집 모드 = 어드민 회원 세션 ∥ PIN 확인.
  // isInitialized 는 두 경로의 확인이 모두 끝난 뒤에만 true — /settings 가 로그인 조회
  // 완료 전에 미인증으로 오판해 리다이렉트하는 것을 막는다.
  const isEditMode = isAdminSession || pinVerified
  const isInitialized = !authLoading && storageLoaded

  useEffect(() => {
    const stored = sessionStorage.getItem(SESSION_KEY)
    if (stored) { setPinVerified(true); setPin(stored) }
    setStorageLoaded(true)
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

  function openPinModal() { setShowModal(true); setDigits([]); setErrorMsg(null) }

  // PIN 폴백만 해제한다. 어드민 role 로 켜진 편집 모드는 계정 권한이므로
  // 클라이언트에서 끌 수 없다 (해제하려면 어드민 권한을 회수해야 함).
  function exitEditMode() {
    sessionStorage.removeItem(SESSION_KEY)
    setPinVerified(false)
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
      const res = await fetch('/api/auth/league-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leagueId, pin: next.join('') }),
      })
      if (res.ok) {
        const verifiedPin = next.join('')
        sessionStorage.setItem(SESSION_KEY, verifiedPin)
        setPin(verifiedPin)
        setPinVerified(true)
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

  // PIN 변경(PATCH .../edit-pin) 성공 후 호출 — 세션의 PIN 을 새 값으로 교체한다.
  // PIN 폴백으로 편집 중일 때만 의미가 있다 (어드민 role 은 PIN 을 안 쓰므로 no-op).
  function updateStoredPin(newPin: string) {
    if (!pinVerified) return
    sessionStorage.setItem(SESSION_KEY, newPin)
    setPin(newPin)
  }

  const PAD = ['1','2','3','4','5','6','7','8','9','','0','⌫']

  // 어드민 role 경로는 쿠키(mm_auth)가 same-origin fetch 에 자동 동봉되므로 헤더가 필요 없다.
  // PIN 폴백일 때만 X-League-Pin 을 싣는다 — 소비처 시그니처는 그대로 유지.
  const leagueHeaders: Record<string, string> = pinVerified
    ? { 'Content-Type': 'application/json', 'X-League-Pin': pin }
    : { 'Content-Type': 'application/json' }

  return (
    <LeagueEditModeContext.Provider value={{ isEditMode, isInitialized, isAdminSession, leagueHeaders, openPinModal, exitEditMode, updateStoredPin }}>
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
              <div className="text-xl font-bold text-white mb-1">편집 모드 전환</div>
              <div className="text-gray-400 text-sm">리그 PIN 번호를 입력하세요</div>
              {/* 전환기 안내 — 어드민 권한을 받은 회원은 로그인만으로 편집 모드가 켜진다 */}
              <div className="text-gray-500 text-xs mt-2">어드민 권한을 받은 회원은 로그인하면<br />PIN 없이 편집 모드가 켜집니다</div>
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
