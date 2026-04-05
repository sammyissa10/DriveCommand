"use client"

import { useState, useEffect } from "react"

/**
 * Client component that polls /api/v1/carrier/dispatches for dispatches
 * with needs_assignment=true status=planned and shows a count badge.
 * Polls every 60 seconds. Fails silently — badge just doesn't appear on error.
 */
export function DispatchBadge() {
  const [count, setCount] = useState(0)

  const fetchCount = async () => {
    try {
      const res = await fetch(
        "/api/v1/carrier/dispatches?needs_assignment=true&status=planned",
        { cache: "no-store" }
      )
      if (!res.ok) return
      const json = await res.json()
      const total: number = json?.data?.total ?? 0
      setCount(total)
    } catch {
      // Silent failure — badge simply won't show
    }
  }

  useEffect(() => {
    fetchCount()
    const interval = setInterval(fetchCount, 60_000)
    return () => clearInterval(interval)
  }, [])

  if (count <= 0) return null

  return (
    <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
      {count > 9 ? "9+" : count}
    </span>
  )
}
