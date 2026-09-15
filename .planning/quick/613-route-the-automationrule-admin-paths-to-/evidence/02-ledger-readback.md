# quick-613 — DEC-17 ledger read-back

migration : 20260915150000_grant_automation_rule_to_app_admin
database  : wyixpgunnjmzguhggocz (staging), connected as postgres
sha256 over LF bytes : 27619f74901178a04d6eaa3d10dc449e5882ec37b33369c8f5da630e9111d949

grants BEFORE : app_user: DELETE · app_user: INSERT · app_user: SELECT · app_user: UPDATE
grants AFTER  : app_admin: SELECT · app_admin: UPDATE · app_user: DELETE · app_user: INSERT · app_user: SELECT · app_user: UPDATE

SENTINEL 20260915140000_automation_rule_per_command_policy_split
  visible: YES

newest 3 ledger rows BEFORE the write:
  20260915140000_automation_rule_per_command_policy_split
  20260915130000_grant_playbook_notification_to_app_admin
  20260915120000_document_column_drift_staging_parity

ledger row INSERTed BY HAND — no MCP tool and no DDL writes this (DEC-17)

READ BACK — newest 3 ledger rows:
  20260915150000_grant_automation_rule_to_app_admin | steps=0 | logs="" | started=finished:true | checksum=27619f74901178a04d6eaa3d10dc449e5882ec37b33369c8f5da630e9111d949
  20260915140000_automation_rule_per_command_policy_split | steps=0 | logs="" | started=finished:true | checksum=546a2913715646cda77d3b0f942fd2f06a928721311895aa66877aa7df981b2d
  20260915130000_grant_playbook_notification_to_app_admin | steps=0 | logs="" | started=finished:true | checksum=9f78d36c16835bec4950fd519dd7db8ba899913581f7d634eab924a5ef61c0b4

HEAD IS OURS: true (expected 20260915150000_grant_automation_rule_to_app_admin)
checksum is a real SHA-256, not 'manual': true
applied_steps_count is 0 (mirrored, not executed by migrate.mjs): true
logs = '' : true
started_at = finished_at : true
staging _prisma_migrations rows AFTER: 160
