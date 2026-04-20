import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Basketball jersey numbers: "00" is distinct from "0" and sorts before it
export function sortJerseyNum(a: string | number, b: string | number): number {
  const sa = String(a), sb = String(b)
  if (sa === sb) return 0
  if (sa === '00') return -1
  if (sb === '00') return 1
  return parseInt(sa) - parseInt(sb)
}
