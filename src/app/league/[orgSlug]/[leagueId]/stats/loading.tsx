import BouncingBall from '@/components/league/ui/BouncingBall'
import StatsSkeleton from '@/components/league/stats/StatsSkeleton'

export default function Loading() {
  return (
    <>
      <BouncingBall />
      <StatsSkeleton />
    </>
  )
}
