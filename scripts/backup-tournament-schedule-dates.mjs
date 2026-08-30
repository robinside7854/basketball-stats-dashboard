// 대회 묶음의 자동 생성 일정 백업 → supabase/backups/
//
//   node scripts/backup-tournament-schedule-dates.mjs
//
// 왜 백업하는가: league_schedule_dates 삭제는 되돌릴 수 없고, Supabase 백업은 **새 프로젝트로만**
// 복원된다(2026-08-11 에 표 3개를 지우기 전 같은 이유로 JSON 을 떠 뒀다).
// 지우는 대상은 **경기가 하나도 없는 날짜**뿐이다 — 경기가 있는 날짜는 기록으로 이어지므로 남긴다.
import { query as q } from './lib/supabase-admin.mjs'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const rows = await q(`
  SELECT sd.id, sd.league_id, sd.date, sd.is_skipped, sd.start_time, sd.place, sd.capacity, sd.created_at,
         (SELECT count(*)::int FROM league_games g
           WHERE g.league_id = sd.league_id AND g.date = sd.date) AS game_count
    FROM league_schedule_dates sd
    JOIN leagues l ON l.id = sd.league_id
   WHERE l.mode = 'tournament'
   ORDER BY sd.date
`)

const out = 'supabase/backups/2026-08-30-tournament-schedule-dates.json'
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, JSON.stringify(rows, null, 2), 'utf8')

const empty = rows.filter(r => r.game_count === 0)
console.log(`대회 묶음 일정 ${rows.length}건 백업 → ${out}`)
console.log(`  경기 없는 날짜(삭제 대상): ${empty.length}건`)
console.log(`  경기 있는 날짜(유지):     ${rows.length - empty.length}건`)
