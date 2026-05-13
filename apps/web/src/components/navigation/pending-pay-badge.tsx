"use client"

import { useState, useEffect } from "react"

/**
 * Polls /api/driver-pay/pending-queue?countOnly=true every 60 seconds
 * and shows a red count badge next to the Driver Pay sidebar link.
 * Only renders when count > 0. Fails silently.
 */
export function PendingPayBadge() {
  const [count, setCount] = useState(0)

  const fetchCount = async () => {
    try {
      const res = await fetch("/api/driver-pay/pending-queue?countOnly=true", {
        cache: "no-store",
      })
      if (!res.ok) return
      const json = await res.json()
      const c = typeof json?.count === "number" ? json.count : 0
      setCount(c)
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
