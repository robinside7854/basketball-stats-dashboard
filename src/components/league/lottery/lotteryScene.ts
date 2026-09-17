// 추첨 3D 씬 (three.js) — React 와 분리된 순수 모듈.
//
// 이 파일이 three 를 정적으로 import 하는 이유:
// 호출부(DraftLotteryReveal)가 이 모듈 자체를 동적 import 하므로 three 는 어차피
// 별도 청크로 떨어진다. 여기서 또 동적 import 하면 타입만 잃고 얻는 게 없다.
//
// 외부 애셋(HDR/텍스처)을 일절 쓰지 않는다 — 오프라인/CSP 환경에서도 그대로 떠야 한다.

import * as THREE from 'three'
// 절차적으로 생성되는 환경맵 — 네트워크 요청이 없다(HDR 파일 다운로드 없음).
// 유리(transmission)는 반사할 환경이 없으면 뿌연 플라스틱처럼 보인다.
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

export type LotteryPhase = 'intro' | 'drawing' | 'revealing' | 'revealed'

export interface SceneTeam {
  id: string
  color: string
}

export interface LotterySceneOptions {
  /** order[0] 이 1픽 — 배출 연출 대상 */
  teams: SceneTeam[]
  reducedMotion: boolean
  /** revealing 페이즈 길이(ms) — 호출부 타이밍과 일치해야 한다 */
  revealingMs: number
}

export interface LotteryScene {
  setPhase(phase: LotteryPhase): void
  resize(width: number, height: number): void
  dispose(): void
}

// ── 씬 스케일 (월드 단위) ────────────────────────────────
const SPHERE_R = 1.6           // 유리구 내경
const TEAM_BALL_R = 0.26
const NEUTRAL_BALL_R = 0.2
const NEUTRAL_COUNT = 12       // 성능 미달 시 여기부터 줄인다
const SPHERE_SEGMENTS = 48

// ── 물리 상수 ────────────────────────────────────────────
const GRAVITY = -5.2
const BLOWER = 16              // 아래쪽 중앙에서 위로 부는 송풍기
const DAMPING = 0.995
const WALL_RESTITUTION = 0.62
const BALL_RESTITUTION = 0.45
const MAX_DT = 1 / 30          // 탭 복귀 시 물리가 폭발하지 않도록 상한

interface Ball {
  mesh: THREE.Mesh
  pos: THREE.Vector3
  vel: THREE.Vector3
  spin: THREE.Vector3
  radius: number
  /** 1픽 팀 공이면 true — revealing 에서 물리에서 빠진다 */
  isWinner: boolean
}

function easeOutCubic(t: number) { return 1 - Math.pow(1 - t, 3) }
function easeInOutCubic(t: number) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2 }

export function createLotteryScene(
  canvas: HTMLCanvasElement,
  opts: LotterySceneOptions,
): LotteryScene {
  const { teams, reducedMotion, revealingMs } = opts

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setClearColor(0x000000, 0)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100)
  const camTarget = new THREE.Vector3(0, 0.05, 0)

  const pmrem = new THREE.PMREMGenerator(renderer)
  const roomEnv = new RoomEnvironment()
  const envRT = pmrem.fromScene(roomEnv, 0.04)
  scene.environment = envRT.texture
  roomEnv.dispose()
  pmrem.dispose()

  // 폐기 추적 — dispose() 에서 한 번에 정리한다
  const geometries: THREE.BufferGeometry[] = []
  const materials: THREE.Material[] = []
  function track<T extends THREE.BufferGeometry>(g: T): T { geometries.push(g); return g }
  function trackM<T extends THREE.Material>(m: T): T { materials.push(m); return m }

  // ── 조명 (환경맵 없음) ─────────────────────────────────
  const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x14161c, 0.55)
  scene.add(hemi)
  const key = new THREE.DirectionalLight(0xffffff, 1.9)
  key.position.set(3.2, 5, 4)
  scene.add(key)
  const rim = new THREE.DirectionalLight(0xffcc66, 1.2)
  rim.position.set(-4, 1.4, -3.5)
  scene.add(rim)

  // ── 받침대 ────────────────────────────────────────────
  const pedestal = new THREE.Mesh(
    track(new THREE.CylinderGeometry(1.25, 1.55, 0.72, 40)),
    trackM(new THREE.MeshStandardMaterial({ color: 0x1b1e26, roughness: 0.45, metalness: 0.55 })),
  )
  pedestal.position.y = -SPHERE_R - 0.36
  scene.add(pedestal)

  const collar = new THREE.Mesh(
    track(new THREE.TorusGeometry(1.02, 0.07, 12, 40)),
    trackM(new THREE.MeshStandardMaterial({ color: 0x3a3f4d, roughness: 0.3, metalness: 0.8 })),
  )
  collar.rotation.x = Math.PI / 2
  collar.position.y = -SPHERE_R + 0.08
  scene.add(collar)

  // ── 유리구 ────────────────────────────────────────────
  const glassMat = trackM(new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transmission: 0.92,
      roughness: 0.05,
      thickness: 1.2,
      ior: 1.45,
      metalness: 0,
      transparent: true,
      envMapIntensity: 1.1,
      // FrontSide 필수 — DoubleSide 로 두면 앞뒷면이 두 번 굴절돼 공이 유령처럼 겹쳐 보인다.
      side: THREE.FrontSide,
  }))
  const glass = new THREE.Mesh(
    track(new THREE.SphereGeometry(SPHERE_R + 0.06, SPHERE_SEGMENTS, SPHERE_SEGMENTS / 2)),
    glassMat,
  )
  scene.add(glass)

  // ── 배출 튜브 (구 상단) ────────────────────────────────
  const tube = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.36, 0.36, 1.1, 24, 1, true)),
    trackM(new THREE.MeshStandardMaterial({
      color: 0xdfe7f5, roughness: 0.15, metalness: 0.1,
      transparent: true, opacity: 0.22, side: THREE.DoubleSide,
    })),
  )
  tube.position.y = SPHERE_R + 0.45
  scene.add(tube)

  // ── 공들 ──────────────────────────────────────────────
  const teamGeo = track(new THREE.SphereGeometry(TEAM_BALL_R, 24, 16))
  const neutralGeo = track(new THREE.SphereGeometry(NEUTRAL_BALL_R, 16, 12))
  const neutralMat = trackM(new THREE.MeshStandardMaterial({
    color: 0x2a2f3a, roughness: 0.65, metalness: 0.25,
  }))

  const balls: Ball[] = []
  let winner: Ball | null = null

  function randomInside(radius: number): THREE.Vector3 {
    const u = Math.random(), v = Math.random(), w = Math.random()
    const r = radius * Math.cbrt(u)
    const theta = Math.acos(2 * v - 1)
    const phi = 2 * Math.PI * w
    return new THREE.Vector3(
      r * Math.sin(theta) * Math.cos(phi),
      r * Math.cos(theta),
      r * Math.sin(theta) * Math.sin(phi),
    )
  }

  teams.forEach((t, i) => {
    const mat = trackM(new THREE.MeshStandardMaterial({
      color: new THREE.Color(t.color || '#888888'),
      roughness: 0.32,
      metalness: 0.15,
      emissive: new THREE.Color(t.color || '#888888'),
      emissiveIntensity: 0.12,
    }))
    const mesh = new THREE.Mesh(teamGeo, mat)
    const pos = randomInside(SPHERE_R - TEAM_BALL_R - 0.25)
    // intro 연출: 위쪽에서 떨어지도록. 상단에 딱 붙이면 송풍기 영향권 밖이라 그대로 굳는다.
    pos.y = Math.abs(pos.y) * 0.6 + 0.35 - i * 0.12
    mesh.position.copy(pos)
    scene.add(mesh)
    const ball: Ball = {
      mesh, pos,
      vel: new THREE.Vector3(0, 0, 0),
      spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(2),
      radius: TEAM_BALL_R,
      isWinner: i === 0,
    }
    if (i === 0) winner = ball
    balls.push(ball)
  })

  for (let i = 0; i < NEUTRAL_COUNT; i++) {
    const mesh = new THREE.Mesh(neutralGeo, neutralMat)
    const pos = randomInside(SPHERE_R - NEUTRAL_BALL_R - 0.05)
    mesh.position.copy(pos)
    scene.add(mesh)
    balls.push({
      mesh, pos,
      vel: new THREE.Vector3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2),
      spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(2),
      radius: NEUTRAL_BALL_R,
      isWinner: false,
    })
  }

  // reducedMotion: 텀블링 없이 바닥에 정렬만 해 둔다
  if (reducedMotion) {
    balls.forEach((b, i) => {
      const ring = Math.floor(i / 6)
      const a = (i % 6) / 6 * Math.PI * 2 + ring * 0.5
      const rr = 0.55 + ring * 0.42
      b.pos.set(Math.cos(a) * rr, -SPHERE_R + b.radius + 0.12 + ring * 0.05, Math.sin(a) * rr)
      b.vel.set(0, 0, 0)
      b.mesh.position.copy(b.pos)
    })
  }

  // ── 상태 ──────────────────────────────────────────────
  let phase: LotteryPhase = 'intro'
  let phaseStart = performance.now()
  let raf: number | null = null
  let disposed = false
  let last = performance.now()
  let orbit = 0
  let camDist = 5.6
  let camDistTarget = 5.6
  const winnerFrom = new THREE.Vector3()
  const winnerDisplay = new THREE.Vector3(0, 0.25, 2.55)
  const tubeExit = new THREE.Vector3(0, SPHERE_R + 0.75, 0)

  const tmpToward = new THREE.Vector3()

  /** 배출된 공이 멈출 자리.
   *  화면 중앙(카메라 축 위)에 두면 유리구와 겹쳐 "아직 안에 있는" 것처럼 보인다 —
   *  실측으로 확인했다. 그래서 오른쪽 위로 비켜 세우고 카메라 쪽으로 당겨 크게 보이게 한다.
   *  세로 390px 에서도 잘리지 않는 범위(카메라가 반경 2.45 를 담도록 맞춰져 있다). */
  function updateWinnerDisplay() {
    tmpToward.set(Math.sin(orbit), 0, Math.cos(orbit))
    if (phase === 'revealed') {
      // 결과 화면의 주인공은 DOM 목록이다 — 공은 가운데 위로 돌아와 배경에 얹힌다.
      // 오른쪽 위에 그대로 두면 390px 에서 화면 밖으로 반쯤 나간다.
      winnerDisplay.set(0, 1.15, 0).addScaledVector(tmpToward, camDist * 0.18)
    } else {
      winnerDisplay.set(1.5, 1.05, 0).addScaledVector(tmpToward, camDist * 0.25)
    }
  }

  function setCameraDistanceForViewport(width: number, height: number) {
    // 세로가 긴 화면(390x844)에서는 가로 화각이 좁아 구가 잘린다 — 더 뒤로 뺀다.
    const aspect = width / Math.max(1, height)
    const vFov = (camera.fov * Math.PI) / 180
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect)
    const fit = Math.min(vFov, hFov)
    // 담아야 할 반경 = 구(1.6) + 상단 튜브(≈1.0) + 여백.
    // 상한을 낮게 잡으면 세로 화면에서 구가 화면 밖으로 넘친다(실측: 11 로 두니 390px 폭을 꽉 채웠다).
    camDistTarget = 2.45 / Math.tan(fit / 2)
    camDistTarget = Math.max(4.2, Math.min(40, camDistTarget))
    if (phase === 'revealed') camDistTarget *= 1.22
  }

  function resize(width: number, height: number) {
    if (disposed || width <= 0 || height <= 0) return
    lastW = width; lastH = height
    renderer.setPixelRatio(pixelRatio())
    renderer.setSize(width, height, false)
    camera.aspect = width / Math.max(1, height)
    setCameraDistanceForViewport(width, height)
    camera.updateProjectionMatrix()
  }

  function setPhase(next: LotteryPhase) {
    if (disposed || next === phase) return
    phase = next
    phaseStart = performance.now()
    if (next === 'revealing' && winner) {
      winnerFrom.copy(winner.pos)
    }
    if (next === 'revealed') {
      camDistTarget *= 1.22
    }
  }

  function stepPhysics(dt: number) {
    const drawing = phase === 'drawing'
    const settle = phase === 'revealing' || phase === 'revealed'
    for (const b of balls) {
      if (b.isWinner && settle) continue
      b.vel.y += GRAVITY * dt
      if (drawing) {
        // 송풍기: 바닥 중앙에서 위로. 중심축에 가까울수록 세다.
        const radial = Math.hypot(b.pos.x, b.pos.z)
        const axis = Math.max(0, 1 - radial / SPHERE_R)
        const height = Math.max(0, 1 - (b.pos.y + SPHERE_R) / (SPHERE_R * 1.6))
        b.vel.y += BLOWER * axis * height * dt
        b.vel.x += (Math.random() - 0.5) * 12 * dt
        b.vel.z += (Math.random() - 0.5) * 12 * dt
      }
      const damp = settle ? 0.982 : DAMPING
      b.vel.multiplyScalar(Math.pow(damp, dt * 60))
      b.pos.addScaledVector(b.vel, dt)

      // 구 경계 반사
      const limit = SPHERE_R - b.radius
      const d = b.pos.length()
      if (d > limit) {
        const n = b.pos.clone().multiplyScalar(1 / (d || 1))
        b.pos.copy(n).multiplyScalar(limit)
        const vn = b.vel.dot(n)
        if (vn > 0) b.vel.addScaledVector(n, -(1 + WALL_RESTITUTION) * vn)
      }
    }

    // 공끼리 겹침 해소 (15개 내외 → 완전 탐색으로 충분)
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i]
      if (a.isWinner && settle) continue
      for (let j = i + 1; j < balls.length; j++) {
        const b = balls[j]
        if (b.isWinner && settle) continue
        const dx = b.pos.x - a.pos.x, dy = b.pos.y - a.pos.y, dz = b.pos.z - a.pos.z
        const distSq = dx * dx + dy * dy + dz * dz
        const min = a.radius + b.radius
        if (distSq >= min * min || distSq === 0) continue
        const dist = Math.sqrt(distSq)
        const nx = dx / dist, ny = dy / dist, nz = dz / dist
        const overlap = (min - dist) * 0.5
        a.pos.x -= nx * overlap; a.pos.y -= ny * overlap; a.pos.z -= nz * overlap
        b.pos.x += nx * overlap; b.pos.y += ny * overlap; b.pos.z += nz * overlap
        const rel = (b.vel.x - a.vel.x) * nx + (b.vel.y - a.vel.y) * ny + (b.vel.z - a.vel.z) * nz
        if (rel > 0) continue
        const imp = -(1 + BALL_RESTITUTION) * rel * 0.5
        a.vel.x -= nx * imp; a.vel.y -= ny * imp; a.vel.z -= nz * imp
        b.vel.x += nx * imp; b.vel.y += ny * imp; b.vel.z += nz * imp
      }
    }
  }

  function updateWinner(now: number, dt: number) {
    if (!winner) return
    const mat = winner.mesh.material as THREE.MeshStandardMaterial
    if (phase === 'revealed') {
      // 배출 위치(오른쪽 위)에서 결과 화면 위치(가운데)로 부드럽게 이동.
      // 페이즈가 바뀌는 순간 좌표를 갈아끼우면 공이 순간이동한 것처럼 튄다.
      updateWinnerDisplay()
      const k = reducedMotion ? 1 : 1 - Math.exp(-dt * 4)
      winner.pos.lerp(winnerDisplay, k)
      winner.mesh.scale.setScalar(1.45)
      mat.emissiveIntensity = reducedMotion ? 0.5 : 0.4 + Math.sin(now / 260) * 0.15
      return
    }
    if (phase === 'revealing') {
      let t = Math.min(1, (now - phaseStart) / revealingMs)
      if (reducedMotion) t = 1

      updateWinnerDisplay()
      if (t < 0.45) {
        // 1) 구 안에서 튜브 입구까지 상승
        const k = easeInOutCubic(t / 0.45)
        winner.pos.lerpVectors(winnerFrom, tubeExit, k)
      } else {
        // 2) 튜브를 빠져나와 카메라 앞으로
        const k = easeOutCubic((t - 0.45) / 0.55)
        winner.pos.lerpVectors(tubeExit, winnerDisplay, k)
        // 살짝 호를 그리도록
        winner.pos.y += Math.sin(k * Math.PI) * 0.35
      }
      const scale = 1 + Math.min(1, Math.max(0, (t - 0.45) / 0.55)) * 0.45
      winner.mesh.scale.setScalar(scale)
      // 배출 순간부터 emissive 맥동
      const pulse = reducedMotion ? 0.7 : 0.45 + Math.sin(now / 140) * 0.28
      mat.emissiveIntensity = t > 0.3 ? pulse : 0.12
    } else {
      mat.emissiveIntensity = 0.12
      winner.mesh.scale.setScalar(1)
    }
  }

  // 느린 기기 자동 강등 — transmission 유리는 매 프레임 씬을 한 번 더 그린다.
  // 저가 안드로이드/소프트웨어 렌더러에서 이게 프레임 예산을 통째로 먹어서,
  // 예쁨보다 부드러움을 택한다. 판정은 워밍업 20프레임 뒤 45프레임 평균으로 한 번만.
  // 프레임 수가 아니라 경과 시간으로 판정한다 — 정말 느린 기기일수록 프레임이 안 쌓여
  // 프레임 수 기준으로는 연출이 다 끝난 뒤에야 강등되기 때문이다.
  const bootAt = performance.now()
  let degraded = false
  let lowRes = false
  let lastW = 0
  let lastH = 0
  function pixelRatio() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    return lowRes ? Math.min(dpr, 1) : dpr
  }
  let sampleN = 0
  let sampleSum = 0
  function maybeDegrade(rawDt: number) {
    if (degraded) return
    const elapsed = performance.now() - bootAt
    // 셰이더 컴파일·환경맵 생성이 끝나기 전에 재면 멀쩡한 폰도 강등된다 — 800ms 는 버린다
    if (elapsed < 800) return
    sampleN++; sampleSum += rawDt
    if (elapsed < 1800 || sampleN < 4) return
    const avg = sampleSum / sampleN
    if (avg <= 0.033) { degraded = true; return } // 30fps 이상 나오면 그대로 간다
    degraded = true
    // 실측 결과 이 씬은 지오메트리가 아니라 **픽셀 수**에 묶여 있다
    // (CPU 4배 스로틀링보다 dpr 1→2 가 프레임을 3배 더 깎았다). 그래서 해상도부터 내린다.
    lowRes = true
    if (lastW > 0) resize(lastW, lastH)
    // 굴절 없이 얇은 반사막만 남긴다. opacity 를 0.2 로 두면 검은 배경 위에서
    // '유리'가 아니라 '어두운 공'으로 보여 안의 공들이 묻힌다(실측).
    glassMat.transmission = 0
    glassMat.opacity = 0.11
    glassMat.roughness = 0.08
    glassMat.envMapIntensity = 1.5
    glassMat.needsUpdate = true
    // 중립 공 절반 제거 (팀 공은 유지 — 연출의 주인공이다)
    for (let i = balls.length - 1; i >= 0 && balls.length > teams.length + 5; i--) {
      if (balls[i].isWinner || i < teams.length) continue
      scene.remove(balls[i].mesh)
      balls.splice(i, 1)
    }
  }

  function frame(now: number) {
    if (disposed) return
    raf = requestAnimationFrame(frame)
    if (document.hidden) { last = now; return }
    const rawDt = Math.max(0, (now - last) / 1000)
    const dt = Math.min(MAX_DT, rawDt)
    last = now
    maybeDegrade(rawDt)

    if (!reducedMotion) stepPhysics(dt)
    updateWinner(now, dt)

    for (const b of balls) {
      b.mesh.position.copy(b.pos)
      if (!reducedMotion) {
        b.mesh.rotation.x += b.spin.x * dt
        b.mesh.rotation.y += b.spin.y * dt
      }
    }

    // 카메라: ±8° 완만한 오빗 + 거리 댐핑
    camDist += (camDistTarget - camDist) * Math.min(1, dt * 2.2)
    if (!reducedMotion) orbit = Math.sin(now / 3400) * (8 * Math.PI / 180)
    camera.position.set(
      Math.sin(orbit) * camDist,
      0.55 + Math.sin(now / 5200) * (reducedMotion ? 0 : 0.12),
      Math.cos(orbit) * camDist,
    )
    camera.lookAt(camTarget)

    renderer.render(scene, camera)
  }

  raf = requestAnimationFrame(frame)

  function dispose() {
    if (disposed) return
    disposed = true
    if (raf != null) cancelAnimationFrame(raf)
    raf = null
    scene.clear()
    for (const g of geometries) g.dispose()
    for (const m of materials) m.dispose()
    geometries.length = 0
    materials.length = 0
    balls.length = 0
    winner = null
    scene.environment = null
    envRT.dispose()
    renderer.dispose()
    // WebGL 컨텍스트를 즉시 반납한다 — 열고 닫기를 반복하면 브라우저 컨텍스트 상한(≈16)에 걸린다.
    renderer.forceContextLoss()
  }

  return { setPhase, resize, dispose }
}
