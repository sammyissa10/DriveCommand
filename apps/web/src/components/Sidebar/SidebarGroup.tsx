"use client"

import { motion, AnimatePresence } from "framer-motion"
import { SidebarItem } from "./SidebarItem"
import { SidebarFlyout } from "./SidebarFlyout"
import type { NavGroup, NavItem } from "./sidebar.config"
import { cn } from "@/lib/utils"

interface SidebarGroupProps {
  group: NavGroup
  isExpanded: boolean
  activePath: string
  onNavigate: () => void
}

/**
 * SidebarGroup - navigation group with label and items
 * - Group label: uppercase, 11px, font-semibold, tracking-wider
 * - When collapsed: hide group labels
 * - For items with children: show inline submenu when expanded, flyout when collapsed
 */
export function SidebarGroup({
  group,
  isExpanded,
  activePath,
  onNavigate,
}: SidebarGroupProps) {
  // Empty label = divider only, no section header (for standalone items like Messages)
  const hasLabel = group.label && group.label.trim() !== ""

  return (
    <div className="mb-4">
      <AnimatePresence mode="wait">
        {isExpanded && hasLabel && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="mb-2 px-2"
          >
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--sidebar-fg-subtle))]">
              {group.label}
            </h3>
          </motion.div>
        )}
        {/* Empty label = divider line instead of section header */}
        {!hasLabel && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="mb-2 mx-2 border-t border-[hsl(var(--sidebar-border-color))]"
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      <nav className="space-y-1">
        {group.items.map((item, index) => {
          const isActive = activePath.startsWith(item.href)
          const hasChildren = item.children && item.children.length > 0

          if (hasChildren && !isExpanded) {
            // Collapsed with children: render flyout
            return (
              <SidebarFlyout
                key={item.href}
                item={item}
                isActive={isActive}
                index={index}
                onNavigate={onNavigate}
              />
            )
          }

          if (hasChildren && isExpanded) {
            // Expanded with children: render parent item + inline submenu
            return (
              <div key={item.href} className="space-y-1">
                <div className="flex items-center gap-3 p-2 rounded-lg">
                  <item.icon
                    className="shrink-0 text-[hsl(var(--sidebar-fg-muted))]"
                    size={16}
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  <motion.span
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.02, duration: 0.15 }}
                    className="text-[13px] font-normal text-[hsl(var(--sidebar-fg-muted))]"
                  >
                    {item.label}
                  </motion.span>
                </div>
                <div className="ml-6 space-y-1 border-l border-sidebar-border pl-3">
                  {item.children?.map((child, childIndex) => {
                    const isChildActive = activePath.startsWith(child.href)
                    return (
                      <SidebarItem
                        key={child.href}
                        item={child}
                        isExpanded={isExpanded}
                        isActive={isChildActive}
                        index={index + childIndex}
                        onNavigate={onNavigate}
                      />
                    )
                  })}
                </div>
              </div>
            )
          }

          // Regular item without children
          return (
            <SidebarItem
              key={item.href}
              item={item}
              isExpanded={isExpanded}
              isActive={isActive}
              index={index}
              onNavigate={onNavigate}
            />
          )
        })}
      </nav>
    </div>
  )
}
