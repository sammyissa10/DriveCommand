"use client"

import { SettingsHeader } from "@/components/settings/SettingsHeader"
import { SETTINGS_PAGE_META } from "@/components/settings/settings.config"
import { Button } from "@/components/ui/button"
import { Plus, Zap } from "lucide-react"

const meta = SETTINGS_PAGE_META.workflows

/**
 * Workflows & Automations Page
 *
 * STUB: This page will eventually allow owners to:
 * - Create automation rules (triggers → actions)
 * - View and manage existing automations
 * - Enable/disable automations
 *
 * Example automations:
 * - When a load is delivered → Send POD request to driver
 * - When a document expires in 30 days → Notify owner
 * - When a new load is created → Auto-assign to available driver
 * - When invoice is overdue → Send reminder email
 *
 * Implementation notes for future development:
 * - Automation table with trigger, conditions, actions fields
 * - Visual rule builder or template-based setup
 * - Execution log for debugging
 */
export default function WorkflowsSettingsPage() {
  const handleCreateAutomation = () => {
    // TODO: Open automation builder modal or navigate to create page
    console.log("Create automation clicked")
  }

  return (
    <div>
      <SettingsHeader title={meta.title} subtitle={meta.subtitle}>
        <Button size="sm" onClick={handleCreateAutomation}>
          <Plus className="w-4 h-4 mr-1.5" />
          Create Automation
        </Button>
      </SettingsHeader>

      {/* Empty state */}
      <div className="py-16 text-center border border-dashed border-border rounded-lg">
        <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
          <Zap className="w-6 h-6 text-muted-foreground" />
        </div>
        <p className="text-sm text-foreground font-medium">No automations yet</p>
        <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
          Create your first automation to save time on repetitive tasks. Automations
          run in the background and trigger actions based on events in your workflow.
        </p>
        <Button
          size="sm"
          variant="outline"
          className="mt-4"
          onClick={handleCreateAutomation}
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Create Automation
        </Button>
      </div>
    </div>
  )
}
