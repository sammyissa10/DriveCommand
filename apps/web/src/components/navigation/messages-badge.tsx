"use client"

import { useState, useEffect } from "react"

/**
 * Client component that polls /api/v1/messages/conversations and shows
 * a total unread count badge next to the Messages sidebar link.
 * Polls every 30 seconds. Fails silently.
 */
export function MessagesBadge() {
  const [count, setCount] = useState(0)

  const fetchCount = async () => {
    try {
      const res = await fetch("/api/v1/messages/conversations?tab=all", {
        cache: "no-store",
      })
      if (!res.ok) return
      const json = await res.json()
      const conversations: { unreadCount: number }[] = json?.conversations ?? []
      const total = conversations.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0)
      setCount(total)
    } catch {
      // Silent failure — badge simply won't show
    }
  }

  useEffect(() => {
    fetchCount()
    const interval = setInterval(fetchCount, 30_000)
    return () => clearInterval(interval)
  }, [])

  if (count <= 0) return null

  return (
    <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
      {count > 9 ? "9+" : count}
    </span>
  )
}
