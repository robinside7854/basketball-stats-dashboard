// Supabase 마이그레이션 러너 — MCP 없이 DDL 실행
//
//   node scripts/db-migrate.mjs status          적용 여부 확인 (기본)
//   node scripts/db-migrate.mjs up              미적용 마이그레이션 전부 실행
//   node scripts/db-migrate.mjs up 073          특정 번호만 실행
//   node scripts/db-migrate.mjs sql "select 1"  임시 쿼리 실행
//
// 배경
//   PostgREST(service role key)로는 DDL 을 못 돌린다. Supabase MCP 가 끊기면
//   마이그레이션이 통째로 막혀 SQL Editor 수동 실행에 의존하게 된다.
//   이 스크립트는 MCP 서버가 내부적으로 쓰는 것과 같은 경로 —
//   Management API(POST /v1/projects/{ref}/database/query) — 를 직접 호출한다.
//
// 자격증명 (아래 순서로 탐색 · 저장소에는 절대 커밋되지 않음)
//   1. 환경변수 SUPABASE_ACCESS_TOKEN
//   2. .env.local 의 SUPABASE_ACCESS_TOKEN
//   3. ~/.claude.json 의 mcpServers.supabase.env.SUPABASE_ACCESS_TOKEN (MCP 설정 재사용)
//
// 적용 이력은 public.applied_migrations 에 기록한다. 같은 파일을 두 번 돌리지 않는다.
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const MIGRATIONS_DIR = 'supabase/migrations'

function readEnvFile(path) {
  if (!existsSync(path)) return {}
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split('\n')
      .filter(l => l.includes('=') && !l.trim().startsWith('#'))
      .map(l => {
        const i = l.indexOf('=')
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
      })
  )
}

function resolveCredentials() {
  const env = readEnvFile('.env.local')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) throw new Error('.env.local 에 NEXT_PUBLIC_SUPABASE_URL 이 없습니다')
  const ref = new URL(url).hostname.split('.')[0]

  let token = process.env.SUPABASE_ACCESS_TOKEN ?? env.SUPABASE_ACCESS_TOKEN
  if (!token) {
    // MCP 설정에 이미 있는 토큰 재사용 — 별도 발급 없이 동작하게
    const cfgPath = join(homedir(), '.claude.json')
    if (existsSync(cfgPath)) {
      const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'))
      for (const server of Object.values(cfg.mcpServers ?? {})) {
        const args = (server.args ?? []).join(' ')
        if (args.includes(ref) && server.env?.SUPABASE_ACCESS_TOKEN) {
          token = server.env.SUPABASE_ACCESS_TOKEN
          break
        }
      }
    }
  }
  if (!token) {
    throw new Error(
      'SUPABASE_ACCESS_TOKEN 을 찾을 수 없습니다.\n' +
      '  Supabase 대시보드 → Account → Access Tokens 에서 발급 후\n' +
      '  .env.local 에 SUPABASE_ACCESS_TOKEN=sbp_... 로 추가하세요.'
    )
  }
  return { ref, token }
}

const { ref, token } = resolveCredentials()

async function query(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Management API ${res.status}\n${text}`)
  try { return JSON.parse(text) } catch { return [] }
}

async function ensureLedger() {
  await query(`
    CREATE TABLE IF NOT EXISTS public.applied_migrations (
      name        TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE public.applied_migrations ENABLE ROW LEVEL SECURITY;
  `)
}

function listMigrations() {
  return readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort()
}

async function appliedSet() {
  const rows = await query('SELECT name FROM public.applied_migrations')
  return new Set(rows.map(r => r.name))
}

// process.exit() 을 쓰면 undici 소켓이 정리되기 전에 종료돼 Windows 에서
// libuv assertion 경고가 찍힌다 → main() 에서 return 하고 자연 종료시킨다.
async function main() {
  const [cmd = 'status', arg] = process.argv.slice(2)

  if (cmd === 'sql') {
    if (!arg) throw new Error('실행할 SQL 을 인자로 주세요')
    console.log(JSON.stringify(await query(arg), null, 2))
    return
  }

  await ensureLedger()
  const applied = await appliedSet()
  const all = listMigrations()

  if (cmd === 'status') {
    console.log(`프로젝트 ${ref} · 마이그레이션 ${all.length}개\n`)
    // 이력 도입 이전 파일은 상태를 알 수 없으므로 '미기록' 으로 구분해 표시
    for (const f of all) console.log(`  ${applied.has(f) ? '✔ 적용됨' : '· 미기록'}  ${f}`)
    console.log('\n※ 이력 테이블 도입(073) 이전 파일은 실제 적용됐어도 "미기록" 으로 나옵니다.')
    console.log('   `up` 은 미기록 파일을 전부 실행하므로, 과거 파일은 번호를 지정해 실행하세요.')
    return
  }

  if (cmd !== 'up') throw new Error(`알 수 없는 명령: ${cmd}`)

  const targets = arg
    ? all.filter(f => f.startsWith(arg) && !applied.has(f))
    : all.filter(f => !applied.has(f))

  if (targets.length === 0) { console.log('실행할 마이그레이션이 없습니다'); return }

  for (const f of targets) {
    process.stdout.write(`▶ ${f} ... `)
    const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf8')
    await query(sql)
    await query(`INSERT INTO public.applied_migrations (name) VALUES ('${f.replace(/'/g, "''")}') ON CONFLICT DO NOTHING`)
    console.log('완료')
  }
  console.log(`\n${targets.length}개 적용됨`)
}

try {
  await main()
} catch (err) {
  console.error(`\n✖ ${err.message}`)
  process.exitCode = 1
}
