// Supabase Management API 공통 접근 모듈
//
// PostgREST(service role key)로는 DDL 이 안 되므로, MCP 서버가 내부적으로 쓰는 것과 같은
// Management API 를 직접 호출한다. db-migrate.mjs 와 verify-schema.mjs 가 공유한다.
//
// 자격증명 탐색 순서 (저장소에는 시크릿이 들어가지 않는다)
//   1. 환경변수 SUPABASE_ACCESS_TOKEN
//   2. .env.local 의 SUPABASE_ACCESS_TOKEN
//   3. ~/.claude.json 의 mcpServers.<name>.env.SUPABASE_ACCESS_TOKEN (MCP 설정 재사용)
import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

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

export function resolveCredentials() {
  const env = readEnvFile('.env.local')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) throw new Error('.env.local 에 NEXT_PUBLIC_SUPABASE_URL 이 없습니다')
  const ref = new URL(url).hostname.split('.')[0]

  let token = process.env.SUPABASE_ACCESS_TOKEN ?? env.SUPABASE_ACCESS_TOKEN
  if (!token) {
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

// 자격증명은 import 시점이 아니라 첫 query() 호출 시점에 지연 해석한다.
// 최상위에서 바로 resolveCredentials() 를 부르면 자격증명이 없는 환경에서
// import 만 해도 예외가 터지고, resolveCredentials 를 내보내는 의미도 없어진다
// (아무도 직접 부를 이유가 없어지므로) — 캐시해서 한 번만 계산한다.
let cached = null
function credentials() {
  if (!cached) cached = resolveCredentials()
  return cached
}

export async function query(sql) {
  const { ref, token } = credentials()
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Management API ${res.status}\n${text}`)
  try { return JSON.parse(text) } catch { return [] }
}

// db-migrate.mjs 의 status 출력이 프로젝트 ref 를 보여주는 데 쓴다 — 게터 함수로 노출
// (top-level const 였던 옛 projectRef 는 import 시점 해석을 강제했으므로 제거)
export function projectRef() {
  return credentials().ref
}
