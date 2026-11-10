import { Download } from 'lucide-react'
import ClubList from '@/components/admin/club/ClubList'

// CEO 콘솔 첫 화면 (2026-11-10 온볼 플랫폼화 1단계 — docs/onball-platform-design.md)
//   종전엔 「토너먼트(파란날개)」·「리그(미라클)」 두 칸으로 갈려 있었다. 이제 **동호회 목록 하나**다.
//   동호회 = teams 한 줄. 리그 시스템(새)·옛 팀 시스템은 카드의 표시로만 구분한다.
export default function AdminDashboardPage() {
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-[var(--mm-ink)]">동호회</h1>
        <p className="text-[var(--mm-muted)] text-sm mt-1 break-keep">온볼에 있는 동호회 전체예요. 누르면 설정·기능·시즌·어드민을 한 화면에서 봐요.</p>
      </div>

      <ClubList />

      {/* 이벤트 로그 내려받기 — 기록 자동화 학습용(2026-10-16). CEO 전용 API 를 그대로 링크한다(스트리밍 파일) */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Download size={16} className="text-[var(--mm-yellow-strong)]" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-[var(--mm-ink-soft)] tracking-wider">이벤트 로그 내려받기</h2>
          <div className="flex-1 h-px bg-[var(--mm-rule)]" />
        </div>
        <p className="text-xs text-[var(--mm-muted)] leading-relaxed break-keep">
          기록한 모든 이벤트를 한 줄에 하나씩 담은 파일입니다. 영상 주소·영상 안 시각(초)·선수·팀·경기 정보가 함께 들어 있습니다.
          친선전·미마감 경기도 포함되니 <code>is_exhibition</code>·<code>is_complete</code> 열로 거르세요.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { source: 'league', title: '리그 시스템', desc: '리그 시스템을 쓰는 동호회 전체' },
            { source: 'team', title: '옛 팀 시스템', desc: '편집 PIN 으로 운영하는 동호회 전체' },
          ].map(x => (
            <div key={x.source} className="p-4 rounded-xl border border-[var(--mm-rule)] bg-[var(--mm-panel)] space-y-3">
              <div>
                <p className="font-semibold text-sm text-[var(--mm-ink)]">{x.title}</p>
                <p className="text-xs text-[var(--mm-muted)]">{x.desc}</p>
              </div>
              <div className="flex gap-2">
                <a href={`/api/admin/export/events?source=${x.source}&format=csv`} download
                  className="flex-1 inline-flex items-center justify-center gap-1.5 min-h-11 px-3 rounded-lg text-sm font-semibold bg-[var(--mm-yellow)] text-[var(--mm-black)]">
                  <Download size={14} aria-hidden="true" /> CSV (엑셀)
                </a>
                <a href={`/api/admin/export/events?source=${x.source}&format=jsonl`} download
                  className="flex-1 inline-flex items-center justify-center gap-1.5 min-h-11 px-3 rounded-lg text-sm font-semibold border border-[var(--mm-rule)] text-[var(--mm-ink)]">
                  <Download size={14} aria-hidden="true" /> JSONL (학습용)
                </a>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
