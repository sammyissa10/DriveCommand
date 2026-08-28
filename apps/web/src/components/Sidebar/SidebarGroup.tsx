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
            // Expanded with children: parent LINK + inline submenu.
            //
            // The parent goes through SidebarItem — which is a <Link> — rather
            // than being hand-rolled. It used to be a plain <div> here, and that
            // is how `/carrier/trips` lost its only sidebar link the moment
            // Document Imports was nested under it: a parent with children was
            // rendered as unclickable text. quick-552 hit the same edge from the
            // other side, when adding Live Board as a child of Live Map deleted
            // the link to the live map.
            //
            // Reusing SidebarItem also restores two things the hand-rolled div
            // silently dropped: `item.badge` (the Trips DispatchBadge had never
            // rendered) and the active pill.
            //
            // The children stay INLINE and always visible — deliberately no
            // chevron disclosure toggle. A toggle would turn a currently-visible
            // child link into a click-to-reveal target, which is the same "trade
            // one unreachable page for another" this branch exists to stop, and
            // it would put a second interactive element inside a 36px row.
            return (
              <div key={item.href} className="space-y-1">
                <SidebarItem
                  item={item}
                  isExpanded={isExpanded}
                  isActive={isActive}
                  index={index}
                  onNavigate={onNavigate}
                />
                <div className="ml-2 space-y-1 border-l border-sidebar-border pl-3">
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
