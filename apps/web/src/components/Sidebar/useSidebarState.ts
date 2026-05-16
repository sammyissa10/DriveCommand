"use client"

import { useState, useEffect } from "react"

const SIDEBAR_COOKIE_NAME = "sidebar:state"
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7 // 7 days

/**
 * Helper to get cookie value by name
 */
function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null
  const value = `; ${document.cookie}`
  const parts = value.split(`; ${name}=`)
  if (parts.length === 2) return parts.pop()?.split(";").shift() || null
  return null
}

/**
 * Helper to set cookie
 */
function setCookie(name: string, value: string, maxAge: number) {
  if (typeof document === "undefined") return
  document.cookie = `${name}=${value}; path=/; max-age=${maxAge}`
}

/**
 * Custom hook managing sidebar expand/collapse state
 * - Persists to localStorage key `sidebar:expanded` (default: true)
 * - Also reads/writes existing cookie `sidebar:state` for backwards compat
 * - Cookie wins if both exist
 * - Hydration-safe: uses useEffect to avoid SSR mismatch
 */
export function useSidebarState() {
  const [isExpanded, setIsExpandedState] = useState(true)
  const [isHydrated, setIsHydrated] = useState(false)

  // Hydration effect - read from cookie/localStorage after mount
  useEffect(() => {
    const cookieState = getCookie(SIDEBAR_COOKIE_NAME)
    const localStorageState = localStorage.getItem("sidebar:expanded")

    let initialState = true

    // Cookie wins if it exists (backwards compat)
    if (cookieState !== null) {
      initialState = cookieState === "true"
    } else if (localStorageState !== null) {
      initialState = localStorageState === "true"
    }

    setIsExpandedState(initialState)
    setIsHydrated(true)
  }, [])

  const toggle = () => {
    setIsExpandedState((prev) => {
      const newState = !prev
      // Update both storage mechanisms
      localStorage.setItem("sidebar:expanded", String(newState))
      setCookie(SIDEBAR_COOKIE_NAME, String(newState), SIDEBAR_COOKIE_MAX_AGE)
      return newState
    })
  }

  const setExpanded = (value: boolean) => {
    setIsExpandedState(value)
    localStorage.setItem("sidebar:expanded", String(value))
    setCookie(SIDEBAR_COOKIE_NAME, String(value), SIDEBAR_COOKIE_MAX_AGE)
  }

  return {
    isExpanded,
    toggle,
    setExpanded,
    isHydrated,
  }
}
