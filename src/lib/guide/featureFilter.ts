// 가이드도 켜진 기능만 보인다 (2026-11-10 온볼 플랫폼화 3단계)
//   장(section id)·자주 묻는 질문 묶음(cat)을 기능 스위치에 잇는다. 여기 없는 장·묶음은 늘 보인다.
import type { ClubFeatures, FeatureKey } from '@/lib/club/features'

const SECTION_FEATURE: Record<string, FeatureKey> = {
  rsvp: 'rsvp',
  wallet: 'wallet',
  month: 'wallet',      // 어드민 「매달 준비」 = 정규권 판매
  bank: 'bank_auto',
}
const FAQ_CAT_FEATURE: Record<string, FeatureKey> = {
  참가신청: 'rsvp',
  월렛: 'wallet',
}

export function sectionVisible(id: string, f: ClubFeatures): boolean {
  const k = SECTION_FEATURE[id]
  return !k || f[k]
}
export function faqVisible(cat: string, f: ClubFeatures): boolean {
  const k = FAQ_CAT_FEATURE[cat]
  return !k || f[k]
}
