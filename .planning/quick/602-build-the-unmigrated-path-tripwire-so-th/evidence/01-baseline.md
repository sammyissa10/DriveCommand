# quick-602 — `01-baseline`

Generated 2026-09-15T05:02:57.188Z against staging (`wyixpgunnjmzguhggocz`).

```json
{
  "staging": {
    "label": "staging",
    "totalPolicies": 183,
    "counts": {
      "covered": 91,
      "inline": 2,
      "bypass": 86,
      "neither": 4
    },
    "sum": 183,
    "ledgerHead": "20260914170000_activation_progress_congrats_shown_at",
    "ledgerTop3": [
      "20260914170000_activation_progress_congrats_shown_at",
      "20260914160000_provisioning_under_app_user",
      "20260914140000_admin_connection_role"
    ],
    "currentTenantId": {
      "language": "sql",
      "prosecdef": false,
      "provolatile": "s",
      "acl": "=X/postgres postgres=X/postgres anon=X/postgres authenticated=X/postgres service_role=X/postgres",
      "def": "CREATE OR REPLACE FUNCTION public.current_tenant_id()\n RETURNS uuid\n LANGUAGE sql\n STABLE\nAS $function$\n  SELECT NULLIF(current_setting('app.current_tenant_id', TRUE), '')::UUID;\n$function$\n"
    },
    "tenantContextRequiredPresent": false,
    "roles": [
      {
        "rolname": "app_admin",
        "rolbypassrls": true
      },
      {
        "rolname": "app_user",
        "rolbypassrls": false
      },
      {
        "rolname": "postgres",
        "rolbypassrls": true
      }
    ],
    "pgDbRoleSetting": [
      {
        "role": "(all roles)",
        "db": "postgres",
        "setconfig": "{app.settings.jwt_exp=3600}"
      },
      {
        "role": "anon",
        "db": "(all databases)",
        "setconfig": "{statement_timeout=3s}"
      },
      {
        "role": "app_admin",
        "db": "(all databases)",
        "setconfig": "{statement_timeout=30s}"
      },
      {
        "role": "app_user",
        "db": "(all databases)",
        "setconfig": "{idle_in_transaction_session_timeout=30s}"
      },
      {
        "role": "authenticated",
        "db": "(all databases)",
        "setconfig": "{statement_timeout=8s}"
      },
      {
        "role": "authenticator",
        "db": "(all databases)",
        "setconfig": "{\"session_preload_libraries=supautils, safeupdate\",statement_timeout=8s,lock_timeout=8s}"
      },
      {
        "role": "postgres",
        "db": "(all databases)",
        "setconfig": "{\"search_path=\\\"\\\\$user\\\", public, extensions\"}"
      },
      {
        "role": "supabase_admin",
        "db": "(all databases)",
        "setconfig": "{\"search_path=\\\"$user\\\", public, auth, extensions\",log_statement=none}"
      },
      {
        "role": "supabase_auth_admin",
        "db": "(all databases)",
        "setconfig": "{search_path=auth,idle_in_transaction_session_timeout=60000,log_statement=none}"
      },
      {
        "role": "supabase_read_only_user",
        "db": "(all databases)",
        "setconfig": "{default_transaction_read_only=on}"
      },
      {
        "role": "supabase_realtime_admin",
        "db": "(all databases)",
        "setconfig": "{\"search_path=public, extensions, realtime\"}"
      },
      {
        "role": "supabase_storage_admin",
        "db": "(all databases)",
        "setconfig": "{search_path=storage,log_statement=none}"
      }
    ],
    "tagRows": {
      "tags": 0,
      "assignments": 0
    },
    "inlineBodies": [
      {
        "table": "Tag",
        "policy": "tenant_isolation_policy",
        "cmd": "*",
        "roles": "",
        "using": "((\"tenantId\")::text = current_setting('app.current_tenant_id'::text, true))",
        "withCheck": null
      },
      {
        "table": "TagAssignment",
        "policy": "tenant_isolation_policy",
        "cmd": "*",
        "roles": "",
        "using": "((\"tenantId\")::text = current_setting('app.current_tenant_id'::text, true))",
        "withCheck": null
      }
    ],
    "bypassTables": [
      "ActivationProgress",
      "AppEvent",
      "AutomationRule",
      "AutomationRun",
      "Customer",
      "CustomerInteraction",
      "DispatchOverrideAudit",
      "DocFeedback",
      "Document",
      "DriverHOSEntry",
      "DriverIncident",
      "DriverInvitation",
      "DriverRouteJoin",
      "ExpenseCategory",
      "ExpenseTemplate",
      "ExpenseTemplateItem",
      "FleetMessage",
      "FuelRecord",
      "GPSLocation",
      "Invoice",
      "InvoiceItem",
      "Load",
      "MaintenanceEvent",
      "NotificationLog",
      "NotificationSendLog",
      "NotificationSubscription",
      "PayrollRecord",
      "Playbook",
      "PlaybookInstance",
      "PlaybookNotification",
      "PlaybookStep",
      "PlaybookTrigger",
      "PushToken",
      "Route",
      "RouteDriver",
      "RouteExpense",
      "RoutePayment",
      "RouteStop",
      "SafetyEvent",
      "ScheduledService",
      "StepInstance",
      "StepTemplate",
      "Subscription",
      "SupportTicket",
      "SysAdminInvoice",
      "SysAdminInvoiceItem",
      "Tag",
      "TagAssignment",
      "Tenant",
      "TenantHealthScore",
      "TenantIntegration",
      "TenantMetricsDaily",
      "TenantNotificationSettings",
      "TicketMessage",
      "Truck",
      "User",
      "UserNotificationPreference",
      "audit_log",
      "carrier_compliance_alert_log",
      "carrier_document_types",
      "carrier_drivers",
      "carrier_expenses",
      "carrier_truck_defects",
      "carrier_trucks",
      "client_contacts",
      "clients",
      "contracts",
      "dispatches",
      "document_import_pages",
      "document_imports",
      "document_profiles",
      "driver_bonuses",
      "driver_compensation_templates",
      "driver_deductions",
      "driver_disputes",
      "driver_pay_audit_logs",
      "driver_pay_records",
      "driver_settlements",
      "facilities",
      "facility_external_references",
      "in_app_notifications",
      "load_driver_assignments",
      "load_pay_components",
      "loads",
      "pay_component_attachments",
      "route_templates"
    ],
    "neither": [
      "UserNotificationPreference.user_isolation_policy",
      "audit_log.audit_log_append_policy",
      "in_app_notifications.in_app_notifications_select_policy",
      "in_app_notifications.in_app_notifications_update_policy"
    ],
    "policyKeys": [
      "ActivationProgress.bypass_rls_policy",
      "ActivationProgress.tenant_isolation_policy",
      "AppEvent.bypass_rls_policy",
      "AppEvent.tenant_isolation_policy",
      "AutomationRule.bypass_rls_policy",
      "AutomationRule.tenant_isolation_policy",
      "AutomationRun.bypass_rls_policy",
      "AutomationRun.tenant_isolation_policy",
      "Customer.bypass_rls_policy",
      "Customer.tenant_isolation_policy",
      "CustomerInteraction.bypass_rls_policy",
      "CustomerInteraction.tenant_isolation_policy",
      "DispatchOverrideAudit.bypass_rls_policy",
      "DispatchOverrideAudit.tenant_isolation_policy",
      "DocFeedback.bypass_rls_policy",
      "DocFeedback.tenant_isolation_policy",
      "Document.bypass_rls_policy",
      "Document.tenant_isolation_policy",
      "DriverHOSEntry.bypass_rls_policy",
      "DriverHOSEntry.tenant_isolation_policy",
      "DriverIncident.bypass_rls_policy",
      "DriverIncident.tenant_isolation_policy",
      "DriverInvitation.bypass_rls_policy",
      "DriverInvitation.tenant_isolation_policy",
      "DriverRouteJoin.bypass_rls_policy",
      "DriverRouteJoin.tenant_isolation_policy",
      "ExpenseCategory.bypass_rls_policy",
      "ExpenseCategory.tenant_isolation_policy",
      "ExpenseTemplate.bypass_rls_policy",
      "ExpenseTemplate.tenant_isolation_policy",
      "ExpenseTemplateItem.bypass_rls_policy",
      "ExpenseTemplateItem.tenant_isolation_policy",
      "FleetMessage.bypass_rls_policy",
      "FleetMessage.tenant_isolation_policy",
      "FuelRecord.bypass_rls_policy",
      "FuelRecord.tenant_isolation_policy",
      "GPSLocation.bypass_rls_policy",
      "GPSLocation.tenant_isolation_policy",
      "Invoice.bypass_rls_policy",
      "Invoice.tenant_isolation_policy",
      "InvoiceItem.bypass_rls_policy",
      "InvoiceItem.tenant_isolation_policy",
      "Load.bypass_rls_policy",
      "Load.tenant_isolation_policy",
      "MaintenanceEvent.bypass_rls_policy",
      "MaintenanceEvent.tenant_isolation_policy",
      "NotificationLog.bypass_rls_policy",
      "NotificationLog.tenant_isolation_policy",
      "NotificationSendLog.bypass_rls_policy",
      "NotificationSendLog.tenant_isolation_policy",
      "NotificationSubscription.bypass_rls_policy",
      "NotificationSubscription.tenant_isolation_policy",
      "PayrollRecord.bypass_rls_policy",
      "PayrollRecord.tenant_isolation_policy",
      "Playbook.bypass_rls_policy",
      "Playbook.tenant_isolation_policy",
      "PlaybookInstance.bypass_rls_policy",
      "PlaybookInstance.tenant_isolation_policy",
      "PlaybookNotification.bypass_rls_policy",
      "PlaybookNotification.tenant_isolation_policy",
      "PlaybookStep.bypass_rls_policy",
      "PlaybookStep.tenant_isolation_policy",
      "PlaybookTrigger.bypass_rls_policy",
      "PlaybookTrigger.tenant_isolation_policy",
      "PushToken.bypass_rls_policy",
      "PushToken.tenant_isolation_policy",
      "Route.bypass_rls_policy",
      "Route.tenant_isolation_policy",
      "RouteDriver.bypass_rls_policy",
      "RouteDriver.tenant_isolation_policy",
      "RouteExpense.bypass_rls_policy",
      "RouteExpense.tenant_isolation_policy",
      "RoutePayment.bypass_rls_policy",
      "RoutePayment.tenant_isolation_policy",
      "RouteStop.bypass_rls_policy",
      "RouteStop.tenant_isolation_policy",
      "SafetyEvent.bypass_rls_policy",
      "SafetyEvent.tenant_isolation_policy",
      "ScheduledService.bypass_rls_policy",
      "ScheduledService.tenant_isolation_policy",
      "StepInstance.bypass_rls_policy",
      "StepInstance.tenant_isolation_policy",
      "StepTemplate.bypass_rls_policy",
      "StepTemplate.tenant_isolation_policy",
      "Subscription.bypass_rls_policy",
      "Subscription.tenant_isolation_policy",
      "SupportTicket.bypass_rls_policy",
      "SupportTicket.tenant_isolation_policy",
      "SysAdminInvoice.bypass_rls_policy",
      "SysAdminInvoice.tenant_isolation_policy",
      "SysAdminInvoiceItem.bypass_rls_policy",
      "SysAdminInvoiceItem.tenant_isolation_policy",
      "Tag.bypass_rls_policy",
      "Tag.tenant_isolation_policy",
      "TagAssignment.bypass_rls_policy",
      "TagAssignment.tenant_isolation_policy",
      "Tenant.bypass_rls_policy",
      "Tenant.tenant_bootstrap_insert",
      "Tenant.tenant_self_read",
      "Tenant.tenant_self_update",
      "TenantHealthScore.bypass_rls_policy",
      "TenantHealthScore.tenant_isolation_policy",
      "TenantIntegration.bypass_rls_policy",
      "TenantIntegration.tenant_isolation_policy",
      "TenantMetricsDaily.bypass_rls_policy",
      "TenantMetricsDaily.tenant_isolation_policy",
      "TenantNotificationSettings.bypass_rls_policy",
      "TenantNotificationSettings.tenant_isolation_policy",
      "TicketMessage.bypass_rls_policy",
      "TicketMessage.tenant_isolation_policy",
      "Truck.bypass_rls_policy",
      "Truck.tenant_isolation_policy",
      "User.bypass_rls_policy",
      "User.tenant_isolation_policy",
      "UserNotificationPreference.bypass_rls_policy",
      "UserNotificationPreference.tenant_isolation_policy",
      "UserNotificationPreference.user_isolation_policy",
      "audit_log.audit_log_append_policy",
      "audit_log.bypass_rls_policy",
      "audit_log.tenant_isolation_policy",
      "carrier_compliance_alert_log.bypass_rls_policy",
      "carrier_compliance_alert_log.tenant_isolation_policy",
      "carrier_document_types.bypass_rls_policy",
      "carrier_document_types.tenant_isolation_policy",
      "carrier_documents.tenant_isolation_policy",
      "carrier_drivers.bypass_rls_policy",
      "carrier_drivers.tenant_isolation_policy",
      "carrier_expenses.bypass_rls_policy",
      "carrier_expenses.tenant_isolation_policy",
      "carrier_truck_defects.bypass_rls_policy",
      "carrier_truck_defects.tenant_isolation_policy",
      "carrier_trucks.bypass_rls_policy",
      "carrier_trucks.tenant_isolation_policy",
      "client_contacts.bypass_rls_policy",
      "client_contacts.tenant_isolation_policy",
      "clients.bypass_rls_policy",
      "clients.tenant_isolation_policy",
      "contracts.bypass_rls_policy",
      "contracts.tenant_isolation_policy",
      "dispatches.bypass_rls_policy",
      "dispatches.tenant_isolation_policy",
      "document_import_pages.bypass_rls_policy",
      "document_import_pages.tenant_isolation_policy",
      "document_imports.bypass_rls_policy",
      "document_imports.tenant_isolation_policy",
      "document_profiles.bypass_rls_policy",
      "document_profiles.tenant_isolation_policy",
      "driver_bonuses.bypass_rls_policy",
      "driver_bonuses.tenant_isolation_policy",
      "driver_compensation_templates.bypass_rls_policy",
      "driver_compensation_templates.tenant_isolation_policy",
      "driver_deductions.bypass_rls_policy",
      "driver_deductions.tenant_isolation_policy",
      "driver_disputes.bypass_rls_policy",
      "driver_disputes.tenant_isolation_policy",
      "driver_pay_audit_logs.bypass_rls_policy",
      "driver_pay_audit_logs.tenant_isolation_policy",
      "driver_pay_records.bypass_rls_policy",
      "driver_pay_records.tenant_isolation_policy",
      "driver_settlements.bypass_rls_policy",
      "driver_settlements.tenant_isolation_policy",
      "facilities.bypass_rls_policy",
      "facilities.tenant_isolation_policy",
      "facility_external_references.bypass_rls_policy",
      "facility_external_references.tenant_isolation_policy",
      "in_app_notifications.bypass_rls_policy",
      "in_app_notifications.in_app_notifications_insert_policy",
      "in_app_notifications.in_app_notifications_select_policy",
      "in_app_notifications.in_app_notifications_update_policy",
      "in_app_notifications.tenant_isolation_policy",
      "load_driver_assignments.bypass_rls_policy",
      "load_driver_assignments.tenant_isolation_policy",
      "load_pay_components.bypass_rls_policy",
      "load_pay_components.tenant_isolation_policy",
      "loads.bypass_rls_policy",
      "loads.tenant_isolation_policy",
      "pay_component_attachments.bypass_rls_policy",
      "pay_component_attachments.tenant_isolation_policy",
      "route_matrix_cache.tenant_isolation_policy",
      "route_template_stops.tenant_isolation_policy",
      "route_templates.bypass_rls_policy",
      "route_templates.tenant_isolation_policy",
      "stops.tenant_isolation_policy"
    ]
  },
  "production": {
    "label": "production",
    "totalPolicies": 183,
    "counts": {
      "covered": 91,
      "inline": 2,
      "bypass": 86,
      "neither": 4
    },
    "sum": 183,
    "ledgerHead": "20260914170000_activation_progress_congrats_shown_at",
    "ledgerTop3": [
      "20260914170000_activation_progress_congrats_shown_at",
      "20260914160000_provisioning_under_app_user",
      "20260914140000_admin_connection_role"
    ],
    "currentTenantId": {
      "language": "sql",
      "prosecdef": false,
      "provolatile": "s",
      "acl": "=X/postgres postgres=X/postgres anon=X/postgres authenticated=X/postgres service_role=X/postgres",
      "def": "CREATE OR REPLACE FUNCTION public.current_tenant_id()\n RETURNS uuid\n LANGUAGE sql\n STABLE\nAS $function$\n  SELECT NULLIF(current_setting('app.current_tenant_id', TRUE), '')::UUID;\n$function$\n"
    },
    "tenantContextRequiredPresent": false,
    "roles": [
      {
        "rolname": "app_admin",
        "rolbypassrls": true
      },
      {
        "rolname": "app_user",
        "rolbypassrls": false
      },
      {
        "rolname": "postgres",
        "rolbypassrls": true
      }
    ],
    "pgDbRoleSetting": [
      {
        "role": "(all roles)",
        "db": "postgres",
        "setconfig": "{app.settings.jwt_exp=3600}"
      },
      {
        "role": "anon",
        "db": "(all databases)",
        "setconfig": "{statement_timeout=3s}"
      },
      {
        "role": "app_admin",
        "db": "(all databases)",
        "setconfig": "{statement_timeout=30s}"
      },
      {
        "role": "app_user",
        "db": "(all databases)",
        "setconfig": "{idle_in_transaction_session_timeout=30s}"
      },
      {
        "role": "authenticated",
        "db": "(all databases)",
        "setconfig": "{statement_timeout=8s}"
      },
      {
        "role": "authenticator",
        "db": "(all databases)",
        "setconfig": "{session_preload_libraries=safeupdate,statement_timeout=8s,lock_timeout=8s}"
      },
      {
        "role": "postgres",
        "db": "(all databases)",
        "setconfig": "{\"search_path=\\\"\\\\$user\\\", public, extensions\"}"
      },
      {
        "role": "supabase_admin",
        "db": "(all databases)",
        "setconfig": "{\"search_path=\\\"$user\\\", public, auth, extensions\",log_statement=none,statement_timeout=0}"
      },
      {
        "role": "supabase_auth_admin",
        "db": "(all databases)",
        "setconfig": "{search_path=auth,idle_in_transaction_session_timeout=60000,log_statement=none}"
      },
      {
        "role": "supabase_read_only_user",
        "db": "(all databases)",
        "setconfig": "{default_transaction_read_only=on}"
      },
      {
        "role": "supabase_storage_admin",
        "db": "(all databases)",
        "setconfig": "{search_path=storage,log_statement=none}"
      }
    ],
    "tagRows": {
      "tags": 0,
      "assignments": 0
    },
    "inlineBodies": [
      {
        "table": "Tag",
        "policy": "tenant_isolation_policy",
        "cmd": "*",
        "roles": "",
        "using": "((\"tenantId\")::text = current_setting('app.current_tenant_id'::text, true))",
        "withCheck": null
      },
      {
        "table": "TagAssignment",
        "policy": "tenant_isolation_policy",
        "cmd": "*",
        "roles": "",
        "using": "((\"tenantId\")::text = current_setting('app.current_tenant_id'::text, true))",
        "withCheck": null
      }
    ],
    "bypassTables": [
      "ActivationProgress",
      "AppEvent",
      "AutomationRule",
      "AutomationRun",
      "Customer",
      "CustomerInteraction",
      "DispatchOverrideAudit",
      "DocFeedback",
      "Document",
      "DriverHOSEntry",
      "DriverIncident",
      "DriverInvitation",
      "DriverRouteJoin",
      "ExpenseCategory",
      "ExpenseTemplate",
      "ExpenseTemplateItem",
      "FleetMessage",
      "FuelRecord",
      "GPSLocation",
      "Invoice",
      "InvoiceItem",
      "Load",
      "MaintenanceEvent",
      "NotificationLog",
      "NotificationSendLog",
      "NotificationSubscription",
      "PayrollRecord",
      "Playbook",
      "PlaybookInstance",
      "PlaybookNotification",
      "PlaybookStep",
      "PlaybookTrigger",
      "PushToken",
      "Route",
      "RouteDriver",
      "RouteExpense",
      "RoutePayment",
      "RouteStop",
      "SafetyEvent",
      "ScheduledService",
      "StepInstance",
      "StepTemplate",
      "Subscription",
      "SupportTicket",
      "SysAdminInvoice",
      "SysAdminInvoiceItem",
      "Tag",
      "TagAssignment",
      "Tenant",
      "TenantHealthScore",
      "TenantIntegration",
      "TenantMetricsDaily",
      "TenantNotificationSettings",
      "TicketMessage",
      "Truck",
      "User",
      "UserNotificationPreference",
      "audit_log",
      "carrier_compliance_alert_log",
      "carrier_document_types",
      "carrier_drivers",
      "carrier_expenses",
      "carrier_truck_defects",
      "carrier_trucks",
      "client_contacts",
      "clients",
      "contracts",
      "dispatches",
      "document_import_pages",
      "document_imports",
      "document_profiles",
      "driver_bonuses",
      "driver_compensation_templates",
      "driver_deductions",
      "driver_disputes",
      "driver_pay_audit_logs",
      "driver_pay_records",
      "driver_settlements",
      "facilities",
      "facility_external_references",
      "in_app_notifications",
      "load_driver_assignments",
      "load_pay_components",
      "loads",
      "pay_component_attachments",
      "route_templates"
    ],
    "neither": [
      "UserNotificationPreference.user_isolation_policy",
      "audit_log.audit_log_append_policy",
      "in_app_notifications.in_app_notifications_select_policy",
      "in_app_notifications.in_app_notifications_update_policy"
    ],
    "policyKeys": [
      "ActivationProgress.bypass_rls_policy",
      "ActivationProgress.tenant_isolation_policy",
      "AppEvent.bypass_rls_policy",
      "AppEvent.tenant_isolation_policy",
      "AutomationRule.bypass_rls_policy",
      "AutomationRule.tenant_isolation_policy",
      "AutomationRun.bypass_rls_policy",
      "AutomationRun.tenant_isolation_policy",
      "Customer.bypass_rls_policy",
      "Customer.tenant_isolation_policy",
      "CustomerInteraction.bypass_rls_policy",
      "CustomerInteraction.tenant_isolation_policy",
      "DispatchOverrideAudit.bypass_rls_policy",
      "DispatchOverrideAudit.tenant_isolation_policy",
      "DocFeedback.bypass_rls_policy",
      "DocFeedback.tenant_isolation_policy",
      "Document.bypass_rls_policy",
      "Document.tenant_isolation_policy",
      "DriverHOSEntry.bypass_rls_policy",
      "DriverHOSEntry.tenant_isolation_policy",
      "DriverIncident.bypass_rls_policy",
      "DriverIncident.tenant_isolation_policy",
      "DriverInvitation.bypass_rls_policy",
      "DriverInvitation.tenant_isolation_policy",
      "DriverRouteJoin.bypass_rls_policy",
      "DriverRouteJoin.tenant_isolation_policy",
      "ExpenseCategory.bypass_rls_policy",
      "ExpenseCategory.tenant_isolation_policy",
      "ExpenseTemplate.bypass_rls_policy",
      "ExpenseTemplate.tenant_isolation_policy",
      "ExpenseTemplateItem.bypass_rls_policy",
      "ExpenseTemplateItem.tenant_isolation_policy",
      "FleetMessage.bypass_rls_policy",
      "FleetMessage.tenant_isolation_policy",
      "FuelRecord.bypass_rls_policy",
      "FuelRecord.tenant_isolation_policy",
      "GPSLocation.bypass_rls_policy",
      "GPSLocation.tenant_isolation_policy",
      "Invoice.bypass_rls_policy",
      "Invoice.tenant_isolation_policy",
      "InvoiceItem.bypass_rls_policy",
      "InvoiceItem.tenant_isolation_policy",
      "Load.bypass_rls_policy",
      "Load.tenant_isolation_policy",
      "MaintenanceEvent.bypass_rls_policy",
      "MaintenanceEvent.tenant_isolation_policy",
      "NotificationLog.bypass_rls_policy",
      "NotificationLog.tenant_isolation_policy",
      "NotificationSendLog.bypass_rls_policy",
      "NotificationSendLog.tenant_isolation_policy",
      "NotificationSubscription.bypass_rls_policy",
      "NotificationSubscription.tenant_isolation_policy",
      "PayrollRecord.bypass_rls_policy",
      "PayrollRecord.tenant_isolation_policy",
      "Playbook.bypass_rls_policy",
      "Playbook.tenant_isolation_policy",
      "PlaybookInstance.bypass_rls_policy",
      "PlaybookInstance.tenant_isolation_policy",
      "PlaybookNotification.bypass_rls_policy",
      "PlaybookNotification.tenant_isolation_policy",
      "PlaybookStep.bypass_rls_policy",
      "PlaybookStep.tenant_isolation_policy",
      "PlaybookTrigger.bypass_rls_policy",
      "PlaybookTrigger.tenant_isolation_policy",
      "PushToken.bypass_rls_policy",
      "PushToken.tenant_isolation_policy",
      "Route.bypass_rls_policy",
      "Route.tenant_isolation_policy",
      "RouteDriver.bypass_rls_policy",
      "RouteDriver.tenant_isolation_policy",
      "RouteExpense.bypass_rls_policy",
      "RouteExpense.tenant_isolation_policy",
      "RoutePayment.bypass_rls_policy",
      "RoutePayment.tenant_isolation_policy",
      "RouteStop.bypass_rls_policy",
      "RouteStop.tenant_isolation_policy",
      "SafetyEvent.bypass_rls_policy",
      "SafetyEvent.tenant_isolation_policy",
      "ScheduledService.bypass_rls_policy",
      "ScheduledService.tenant_isolation_policy",
      "StepInstance.bypass_rls_policy",
      "StepInstance.tenant_isolation_policy",
      "StepTemplate.bypass_rls_policy",
      "StepTemplate.tenant_isolation_policy",
      "Subscription.bypass_rls_policy",
      "Subscription.tenant_isolation_policy",
      "SupportTicket.bypass_rls_policy",
      "SupportTicket.tenant_isolation_policy",
      "SysAdminInvoice.bypass_rls_policy",
      "SysAdminInvoice.tenant_isolation_policy",
      "SysAdminInvoiceItem.bypass_rls_policy",
      "SysAdminInvoiceItem.tenant_isolation_policy",
      "Tag.bypass_rls_policy",
      "Tag.tenant_isolation_policy",
      "TagAssignment.bypass_rls_policy",
      "TagAssignment.tenant_isolation_policy",
      "Tenant.bypass_rls_policy",
      "Tenant.tenant_bootstrap_insert",
      "Tenant.tenant_self_read",
      "Tenant.tenant_self_update",
      "TenantHealthScore.bypass_rls_policy",
      "TenantHealthScore.tenant_isolation_policy",
      "TenantIntegration.bypass_rls_policy",
      "TenantIntegration.tenant_isolation_policy",
      "TenantMetricsDaily.bypass_rls_policy",
      "TenantMetricsDaily.tenant_isolation_policy",
      "TenantNotificationSettings.bypass_rls_policy",
      "TenantNotificationSettings.tenant_isolation_policy",
      "TicketMessage.bypass_rls_policy",
      "TicketMessage.tenant_isolation_policy",
      "Truck.bypass_rls_policy",
      "Truck.tenant_isolation_policy",
      "User.bypass_rls_policy",
      "User.tenant_isolation_policy",
      "UserNotificationPreference.bypass_rls_policy",
      "UserNotificationPreference.tenant_isolation_policy",
      "UserNotificationPreference.user_isolation_policy",
      "audit_log.audit_log_append_policy",
      "audit_log.bypass_rls_policy",
      "audit_log.tenant_isolation_policy",
      "carrier_compliance_alert_log.bypass_rls_policy",
      "carrier_compliance_alert_log.tenant_isolation_policy",
      "carrier_document_types.bypass_rls_policy",
      "carrier_document_types.tenant_isolation_policy",
      "carrier_documents.tenant_isolation_policy",
      "carrier_drivers.bypass_rls_policy",
      "carrier_drivers.tenant_isolation_policy",
      "carrier_expenses.bypass_rls_policy",
      "carrier_expenses.tenant_isolation_policy",
      "carrier_truck_defects.bypass_rls_policy",
      "carrier_truck_defects.tenant_isolation_policy",
      "carrier_trucks.bypass_rls_policy",
      "carrier_trucks.tenant_isolation_policy",
      "client_contacts.bypass_rls_policy",
      "client_contacts.tenant_isolation_policy",
      "clients.bypass_rls_policy",
      "clients.tenant_isolation_policy",
      "contracts.bypass_rls_policy",
      "contracts.tenant_isolation_policy",
      "dispatches.bypass_rls_policy",
      "dispatches.tenant_isolation_policy",
      "document_import_pages.bypass_rls_policy",
      "document_import_pages.tenant_isolation_policy",
      "document_imports.bypass_rls_policy",
      "document_imports.tenant_isolation_policy",
      "document_profiles.bypass_rls_policy",
      "document_profiles.tenant_isolation_policy",
      "driver_bonuses.bypass_rls_policy",
      "driver_bonuses.tenant_isolation_policy",
      "driver_compensation_templates.bypass_rls_policy",
      "driver_compensation_templates.tenant_isolation_policy",
      "driver_deductions.bypass_rls_policy",
      "driver_deductions.tenant_isolation_policy",
      "driver_disputes.bypass_rls_policy",
      "driver_disputes.tenant_isolation_policy",
      "driver_pay_audit_logs.bypass_rls_policy",
      "driver_pay_audit_logs.tenant_isolation_policy",
      "driver_pay_records.bypass_rls_policy",
      "driver_pay_records.tenant_isolation_policy",
      "driver_settlements.bypass_rls_policy",
      "driver_settlements.tenant_isolation_policy",
      "facilities.bypass_rls_policy",
      "facilities.tenant_isolation_policy",
      "facility_external_references.bypass_rls_policy",
      "facility_external_references.tenant_isolation_policy",
      "in_app_notifications.bypass_rls_policy",
      "in_app_notifications.in_app_notifications_insert_policy",
      "in_app_notifications.in_app_notifications_select_policy",
      "in_app_notifications.in_app_notifications_update_policy",
      "in_app_notifications.tenant_isolation_policy",
      "load_driver_assignments.bypass_rls_policy",
      "load_driver_assignments.tenant_isolation_policy",
      "load_pay_components.bypass_rls_policy",
      "load_pay_components.tenant_isolation_policy",
      "loads.bypass_rls_policy",
      "loads.tenant_isolation_policy",
      "pay_component_attachments.bypass_rls_policy",
      "pay_component_attachments.tenant_isolation_policy",
      "route_matrix_cache.tenant_isolation_policy",
      "route_template_stops.tenant_isolation_policy",
      "route_templates.bypass_rls_policy",
      "route_templates.tenant_isolation_policy",
      "stops.tenant_isolation_policy"
    ]
  },
  "setDifference": {
    "onlyStaging": [],
    "onlyProduction": []
  }
}
```

| direction | probe | result |
|---|---|---|
| observation | policy-name set difference staging <-> production is empty, BOTH directions | OK — 0 only-staging, 0 only-production |
| observation | current_tenant_id() is byte-identical on both databases | OK — identical |

---

## Narrative (appended by hand after the final `--baseline` run)

### Every Given fact re-confirmed, on BOTH databases

| fact | staging | production | plan's table | verdict |
|---|---|---|---|---|
| policies in `public` | 183 | 183 | 183 | confirmed |
| route through `current_tenant_id()` | 91 | 91 | 91 | confirmed |
| inline `current_setting('app.current_tenant_id', …)` | 2 | 2 | 2 | confirmed |
| `app.bypass_rls` policies | 86 | 86 | 86 | confirmed |
| neither | 4 | 4 | 4 | confirmed |
| sum | 183 | 183 | 183 | confirmed |
| newest `_prisma_migrations` row | `20260914170000_activation_progress_congrats_shown_at` | same | same | confirmed |
| `current_tenant_id()` body | `SELECT NULLIF(current_setting('app.current_tenant_id', TRUE), '')::UUID;` | byte-identical | same | confirmed |
| `prosecdef` / volatility / language | `false` / `s` (STABLE) / `sql` | same | same | confirmed |
| `tenant_context_required` present | no | no | n/a | confirmed absent |
| `rolbypassrls` | `app_user` false, `app_admin` true, `postgres` true | same | same | confirmed |
| `Tag` / `TagAssignment` rows | 0 / 0 | 0 / 0 | 0 each | confirmed — fixtures are mandatory |
| policy-name set difference, both directions | — | — | — | **empty both ways** |

The 4 `neither` policies are exactly the four the plan names:
`UserNotificationPreference.user_isolation_policy`, `audit_log.audit_log_append_policy`,
`in_app_notifications.in_app_notifications_select_policy`,
`in_app_notifications.in_app_notifications_update_policy`.

### The two inline bodies, quoted verbatim from `pg_get_expr` (identical on both databases)

```sql
-- "Tag".tenant_isolation_policy          ALL, PERMISSIVE, roles {} (PUBLIC), WITH CHECK null
-- "TagAssignment".tenant_isolation_policy  ALL, PERMISSIVE, roles {} (PUBLIC), WITH CHECK null
USING (("tenantId")::text = current_setting('app.current_tenant_id'::text, true))
```

### Two disagreements with the Given-facts table — reported, not quietly adopted

1. **`pg_db_role_setting` carries more than the two rows the plan lists.** The plan names
   `app_user → idle_in_transaction_session_timeout=30s` and the database-level
   `app.settings.jwt_exp=3600`; both are present and correct. It does **not** mention
   `app_admin → statement_timeout=30s` (present on both databases, from quick-600), nor the Supabase
   platform rows (`anon`, `authenticated`, `authenticator`, `postgres`, `supabase_*`). Neither of the
   two omitted-but-present rows affects this task; they are recorded so the Task-3 "byte-identical
   `pg_db_role_setting`" assertion compares against the full reading rather than the plan's excerpt.
2. **Staging and production `pg_db_role_setting` differ from each other** in three platform rows:
   staging carries `supabase_realtime_admin`, production does not; `authenticator`'s
   `session_preload_libraries` is `supautils, safeupdate` on staging and `safeupdate` on production;
   `supabase_admin` carries `statement_timeout=0` on production only. All three are Supabase platform
   configuration, none is application configuration, and none is touched by this task.

### `current_tenant_id()`'s ACL today — the reason the new helper needs explicit REVOKEs

```
=X/postgres postgres=X/postgres anon=X/postgres authenticated=X/postgres service_role=X/postgres
```

PUBLIC (`=X/`) **and** `anon`, `authenticated`, `service_role` all hold EXECUTE on the existing
function — the `ALTER DEFAULT PRIVILEGES` grants quick-601 measured. The new
`tenant_context_required(text)` must therefore revoke PUBLIC *and* those three roles explicitly; a
PUBLIC revoke alone leaves three named grants standing, and Supabase's PostgREST exposes `public`
functions to `anon` over `/rpc/`.

### The 87 → 91 delta, derived per policy from the three intervening migrations' SQL

Read from `prisma/migrations/*/migration.sql`, one line per `CREATE POLICY` / `DROP POLICY` / body
rewrite. This is the derivation; the arithmetic table in the plan is the check on it, not its source.

| # | migration | policy | what the SQL does | bucket move |
|---|---|---|---|---|
| — | (audit 2026-09-12 baseline) | — | — | 87 / 5 / 86 / 5 = 183 |
| 1 | `20260913120000_rls_policy_satisfiability_fixes` | `audit_log.tenant_isolation_policy` | `DROP` + `CREATE … USING (tenant_id = current_tenant_id())` — replaces the inline cast | inline → covered (+1 / −1) |
| 2 | `20260913120000` | `"PushToken".user_isolation_policy` | `DROP POLICY IF EXISTS`, no recreate | neither −1 |
| 3 | `20260913120000` | `"SysAdminInvoice".sysadmin_invoices_deny_tenant_users` | `DROP POLICY IF EXISTS`, no recreate | inline −1 |
| 4 | `20260913120000` | `"SysAdminInvoiceItem".sysadmin_invoice_items_deny_tenant_users` | `DROP POLICY IF EXISTS`, no recreate | inline −1 |
| 5 | `20260913120000` | `in_app_notifications_insert_policy` | `DROP` + `CREATE … WITH CHECK (org_id = current_tenant_id())`, was `WITH CHECK (true)` | neither → covered (+1 / −1) |
| | **after 597** | | | **89 / 2 / 86 / 3 = 180** |
| 6 | `20260914120000_tenant_audit_automation_policy_closure` | `"Tenant".tenant_bootstrap_insert` | `DROP` + `CREATE … WITH CHECK (NULLIF(current_setting('app.current_tenant_id', TRUE),'') IS NULL)` | inline +1 |
| 7 | `20260914120000` | `"Tenant".tenant_self_update` | new `CREATE POLICY … current_tenant_id()` | covered +1 |
| 8 | `20260914120000` | `audit_log.tenant_isolation_policy` | `DROP` + `CREATE` as `FOR SELECT`, same `current_tenant_id()` predicate | covered ±0 (stays covered; the split's SELECT half keeps the original name) |
| 9 | `20260914120000` | `audit_log.audit_log_append_policy` | new `CREATE POLICY … FOR INSERT WITH CHECK (true)` | neither +1 |
| 10 | `20260914120000` | `"AutomationRule".tenant_isolation_policy` | `DROP` + `CREATE`, adds an explicit `WITH CHECK`; still `current_tenant_id()` | covered ±0 |
| | **after 599** | | | **90 / 3 / 86 / 4 = 183** |
| 11 | `20260914160000_provisioning_under_app_user` | `"Tenant".tenant_bootstrap_insert` | `DROP` + `CREATE … WITH CHECK (id = current_tenant_id())` | inline → covered (+1 / −1) |
| | **today, measured above** | | | **91 / 2 / 86 / 4 = 183 ✓** |

The derivation reproduces the plan's arithmetic exactly. **After this task's migration:
93 / 0 / 86 / 4 = 183** — coverage of the signal goes from 91 to 93 of 183.
