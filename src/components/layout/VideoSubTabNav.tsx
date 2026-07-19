'use client'
// 영상 그룹 서브탭(하이라이트/코치 핀/리뷰) 전용 클라이언트 래퍼.
// highlights/page.tsx 가 Server Component 라 useEditMode() 를 직접 쓸 수 없어 분리했다.
import SubTabNav from '@/components/layout/SubTabNav'
import { videoSubTabs } from '@/components/layout/subTabs'
import { useEditMode } from '@/contexts/EditModeContext'

export default function VideoSubTabNav() {
  const { isEditMode } = useEditMode()
  return <SubTabNav tabs={videoSubTabs(isEditMode)} />
}
