# Deep Diagnostic — RLS Fix Migration Prerequisites
Generated: 2026-05-27T16:30:48.220Z


## Section 1 — current_tenant_id() function definition

### Function: current_tenant_id()

| Property | Value |
|---|---|
| provolatile | STABLE |
| prosecdef | false (SECURITY INVOKER) |
| owner | postgres |

**Function body:**
```sql

  SELECT NULLIF(current_setting('app.current_tenant_id', TRUE), '')::UUID;

```

**RISKY — VERIFY POLICIES**

### Other public-schema functions referencing tenant_id

(none found)

## Section 2 — Tenant table existing policies

### Policy: bypass_rls_policy

| Property | Value |
|---|---|
| roles | public |
| cmd | ALL |
| permissive | PERMISSIVE |

**USING (qual):**
```sql
(current_setting('app.bypass_rls'::text, true) = 'on'::text)
```

**WITH CHECK:**
```sql
(none)
```

**TENANT FORCE RLS UNSAFE**

## Section 3 — Tier 4 table policies (carrier_documents, route_template_stops, stops, TicketMessage)

### Table: carrier_documents

#### Policy: carrier_documents_insert

| Property | Value |
|---|---|
| roles | public |
| cmd | INSERT |
| permissive | PERMISSIVE |

**USING (qual):**
```sql
(none)
```

**WITH CHECK:**
```sql
((uploaded_by = auth.uid()) AND (((auth.jwt() ->> 'role'::text) = ANY (ARRAY['OWNER'::text, 'MANAGER'::text])) OR (((auth.jwt() ->> 'role'::text) = 'DRIVER'::text) AND ((stop_id IS NULL) OR (stop_id IN ( SELECT s.id
   FROM (stops s
     JOIN dispatches d ON ((s.dispatch_id = d.id)))
  WHERE ((d.primary_driver_id = ( SELECT carrier_drivers.id
           FROM carrier_drivers
          WHERE (carrier_drivers.user_id = auth.uid()))) OR (d.co_driver_id = ( SELECT carrier_drivers.id
           FROM carrier_drivers
          WHERE (carrier_drivers.user_id = auth.uid()))))))))))
```

#### Policy: carrier_documents_org_delete

| Property | Value |
|---|---|
| roles | public |
| cmd | DELETE |
| permissive | PERMISSIVE |

**USING (qual):**
```sql
(((auth.jwt() ->> 'role'::text) = ANY (ARRAY['OWNER'::text, 'MANAGER'::text])) AND (((client_id IS NOT NULL) AND (client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.org_id = ((auth.jwt() ->> 'org_id'::text))::uuid)))) OR ((stop_id IS NOT NULL) AND (stop_id IN ( SELECT s.id
   FROM (stops s
     JOIN dispatches d ON ((s.dispatch_id = d.id)))
  WHERE (d.org_id = ((auth.jwt() ->> 'org_id'::text))::uuid)
UNION
 SELECT s.id
   FROM (stops s
     JOIN loads l ON ((s.load_id = l.id)))
  WHERE (l.org_id = ((auth.jwt() ->> 'org_id'::text))::uuid))))))
```

**WITH CHECK:**
```sql
(none)
```

#### Policy: carrier_documents_org_update

| Property | Value |
|---|---|
| roles | public |
| cmd | UPDATE |
| permissive | PERMISSIVE |

**USING (qual):**
```sql
(((auth.jwt() ->> 'role'::text) = ANY (ARRAY['OWNER'::text, 'MANAGER'::text])) AND (((client_id IS NOT NULL) AND (client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.org_id = ((auth.jwt() ->> 'org_id'::text))::uuid)))) OR ((stop_id IS NOT NULL) AND (stop_id IN ( SELECT s.id
   FROM (stops s
     JOIN dispatches d ON ((s.dispatch_id = d.id)))
  WHERE (d.org_id = ((auth.jwt() ->> 'org_id'::text))::uuid)
UNION
 SELECT s.id
   FROM (stops s
     JOIN loads l ON ((s.load_id = l.id)))
  WHERE (l.org_id = ((auth.jwt() ->> 'org_id'::text))::uuid))))))
```

**WITH CHECK:**
```sql
(none)
```

#### Policy: carrier_documents_select

| Property | Value |
|---|---|
| roles | public |
| cmd | SELECT |
| permissive | PERMISSIVE |

**USING (qual):**
```sql
((uploaded_by = auth.uid()) OR ((client_id IS NOT NULL) AND (client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.org_id = ((auth.jwt() ->> 'org_id'::text))::uuid)))) OR ((stop_id IS NOT NULL) AND (stop_id IN ( SELECT s.id
   FROM (stops s
     JOIN dispatches d ON ((s.dispatch_id = d.id)))
  WHERE (d.org_id = ((auth.jwt() ->> 'org_id'::text))::uuid)
UNION
 SELECT s.id
   FROM (stops s
     JOIN loads l ON ((s.load_id = l.id)))
  WHERE (l.org_id = ((auth.jwt() ->> 'org_id'::text))::uuid)))))
```

**WITH CHECK:**
```sql
(none)
```

**Functions called in policy expressions:**
- uid
- jwt

**carrier_documents: FORCE RLS NEEDS REVIEW — POLICY CALLS uid, jwt**

### Table: route_template_stops

#### Policy: route_template_stops_org_delete

| Property | Value |
|---|---|
| roles | public |
| cmd | DELETE |
| permissive | PERMISSIVE |

**USING (qual):**
```sql
(((auth.jwt() ->> 'role'::text) = ANY (ARRAY['OWNER'::text, 'MANAGER'::text])) AND (route_template_id IN ( SELECT route_templates.id
   FROM route_templates
  WHERE (route_templates.org_id = ((auth.jwt() ->> 'org_id'::text))::uuid))))
```

**WITH CHECK:**
```sql
(none)
```

#### Policy: route_template_stops_org_insert

| Property | Value |
|---|---|
| roles | public |
| cmd | INSERT |
| permissive | PERMISSIVE |

**USING (qual):**
```sql
(none)
```

**WITH CHECK:**
```sql
(((auth.jwt() ->> 'role'::text) = ANY (ARRAY['OWNER'::text, 'MANAGER'::text])) AND (route_template_id IN ( SELECT route_templates.id
   FROM route_templates
  WHERE (route_templates.org_id = ((auth.jwt() ->> 'org_id'::text))::uuid))))
```

#### Policy: route_template_stops_org_select

| Property | Value |
|---|---|
| roles | public |
| cmd | SELECT |
| permissive | PERMISSIVE |

**USING (qual):**
```sql
(route_template_id IN ( SELECT route_templates.id
   FROM route_templates
  WHERE (route_templates.org_id = ((auth.jwt() ->> 'org_id'::text))::uuid)))
```

**WITH CHECK:**
```sql
(none)
```

#### Policy: route_template_stops_org_update

| Property | Value |
|---|---|
| roles | public |
| cmd | UPDATE |
| permissive | PERMISSIVE |

**USING (qual):**
```sql
(((auth.jwt() ->> 'role'::text) = ANY (ARRAY['OWNER'::text, 'MANAGER'::text])) AND (route_template_id IN ( SELECT route_templates.id
   FROM route_templates
  WHERE (route_templates.org_id = ((auth.jwt() ->> 'org_id'::text))::uuid))))
```

**WITH CHECK:**
```sql
(none)
```

**Functions called in policy expressions:**
- jwt

**route_template_stops: FORCE RLS NEEDS REVIEW — POLICY CALLS jwt**

### Table: stops

#### Policy: stops_driver_select

| Property | Value |
|---|---|
| roles | public |
| cmd | SELECT |
| permissive | PERMISSIVE |

**USING (qual):**
```sql
(((auth.jwt() ->> 'role'::text) = 'DRIVER'::text) AND (dispatch_id IS NOT NULL) AND (dispatch_id IN ( SELECT dispatches.id
   FROM dispatches
  WHERE ((dispatches.primary_driver_id = ( SELECT carrier_drivers.id
           FROM carrier_drivers
          WHERE (carrier_drivers.user_id = auth.uid()))) OR (dispatches.co_driver_id = ( SELECT carrier_drivers.id
           FROM carrier_drivers
          WHERE (carrier_drivers.user_id = auth.uid())))))))
```

**WITH CHECK:**
```sql
(none)
```

#### Policy: stops_driver_update

| Property | Value |
|---|---|
| roles | public |
| cmd | UPDATE |
| permissive | PERMISSIVE |

**USING (qual):**
```sql
(((auth.jwt() ->> 'role'::text) = 'DRIVER'::text) AND (dispatch_id IS NOT NULL) AND (dispatch_id IN ( SELECT dispatches.id
   FROM dispatches
  WHERE ((dispatches.primary_driver_id = ( SELECT carrier_drivers.id
           FROM carrier_drivers
          WHERE (carrier_drivers.user_id = auth.uid()))) OR (dispatches.co_driver_id = ( SELECT carrier_drivers.id
           FROM carrier_drivers
          WHERE (carrier_drivers.user_id = auth.uid())))))))
```

**WITH CHECK:**
```sql
(none)
```

#### Policy: stops_org_delete

| Property | Value |
|---|---|
| roles | public |
| cmd | DELETE |
| permissive | PERMISSIVE |

**USING (qual):**
```sql
(((auth.jwt() ->> 'role'::text) = ANY (ARRAY['OWNER'::text, 'MANAGER'::text])) AND (((dispatch_id IS NOT NULL) AND (dispatch_id IN ( SELECT dispatches.id
   FROM dispatches
  WHERE (dispatches.org_id = ((auth.jwt() ->> 'org_id'::text))::uuid)))) OR ((load_id IS NOT NULL) AND (load_id IN ( SELECT loads.id
   FROM loads
  WHERE (loads.org_id = ((auth.jwt() ->> 'org_id'::text))::uuid))))))
```

**WITH CHECK:**
```sql
(none)
```

#### Policy: stops_org_insert

| Property | Value |
|---|---|
| roles | public |
| cmd | INSERT |
| permissive | PERMISSIVE |

**USING (qual):**
```sql
(none)
```

**WITH CHECK:**
```sql
(((auth.jwt() ->> 'role'::text) = ANY (ARRAY['OWNER'::text, 'MANAGER'::text])) AND (((dispatch_id IS NOT NULL) AND (dispatch_id IN ( SELECT dispatches.id
   FROM dispatches
  WHERE (dispatches.org_id = ((auth.jwt() ->> 'org_id'::text))::uuid)))) OR ((load_id IS NOT NULL) AND (load_id IN ( SELECT loads.id
   FROM loads
  WHERE (loads.org_id = ((auth.jwt() ->> 'org_id'::text))::uuid))))))
```

#### Policy: stops_org_select

| Property | Value |
|---|---|
| roles | public |
| cmd | SELECT |
| permissive | PERMISSIVE |

**USING (qual):**
```sql
(((dispatch_id IS NOT NULL) AND (dispatch_id IN ( SELECT dispatches.id
   FROM dispatches
  WHERE (dispatches.org_id = ((auth.jwt() ->> 'org_id'::text))::uuid)))) OR ((load_id IS NOT NULL) AND (load_id IN ( SELECT loads.id
   FROM loads
  WHERE (loads.org_id = ((auth.jwt() ->> 'org_id'::text))::uuid)))))
```

**WITH CHECK:**
```sql
(none)
```

#### Policy: stops_org_update

| Property | Value |
|---|---|
| roles | public |
| cmd | UPDATE |
| permissive | PERMISSIVE |

**USING (qual):**
```sql
(((auth.jwt() ->> 'role'::text) = ANY (ARRAY['OWNER'::text, 'MANAGER'::text])) AND (((dispatch_id IS NOT NULL) AND (dispatch_id IN ( SELECT dispatches.id
   FROM dispatches
  WHERE (dispatches.org_id = ((auth.jwt() ->> 'org_id'::text))::uuid)))) OR ((load_id IS NOT NULL) AND (load_id IN ( SELECT loads.id
   FROM loads
  WHERE (loads.org_id = ((auth.jwt() ->> 'org_id'::text))::uuid))))))
```

**WITH CHECK:**
```sql
(none)
```

**Functions called in policy expressions:**
- jwt
- uid

**stops: FORCE RLS NEEDS REVIEW — POLICY CALLS jwt, uid**

### Table: TicketMessage

#### Policy: bypass_rls_policy

| Property | Value |
|---|---|
| roles | public |
| cmd | ALL |
| permissive | PERMISSIVE |

**USING (qual):**
```sql
(current_setting('app.bypass_rls'::text, true) = 'on'::text)
```

**WITH CHECK:**
```sql
(none)
```

#### Policy: tenant_isolation_policy

| Property | Value |
|---|---|
| roles | public |
| cmd | ALL |
| permissive | PERMISSIVE |

**USING (qual):**
```sql
("ticketId" IN ( SELECT "SupportTicket".id
   FROM "SupportTicket"
  WHERE ("SupportTicket"."tenantId" = current_tenant_id())))
```

**WITH CHECK:**
```sql
(none)
```

**Functions called in policy expressions:**
- current_setting
- current_tenant_id

**TicketMessage: FORCE RLS NEEDS REVIEW — POLICY CALLS current_setting**


## Section 4 — userId FK resolution for grid_preference and grid_view

### Table: grid_preference

| Property | Value |
|---|---|
| data_type | uuid |
| udt_name | uuid |
| is_nullable | NO |
| column_default | NULL |

`grid_preference.userId` references **(no FK constraint)**

**grid_preference: MANUAL VERIFICATION NEEDED — userId has no FK**

### Table: grid_view

| Property | Value |
|---|---|
| data_type | uuid |
| udt_name | uuid |
| is_nullable | NO |
| column_default | NULL |

`grid_view.userId` references `public.User.id`

**grid_view: AUTH.UID() POLICY WILL FAIL — userId references public.User.id**


## Section 5 — NotificationEmailConfig column inventory

| Name | Data Type | Nullable | Default | Flagged |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | - |
| singletonKey | text | NO | 'singleton'::text | - |
| fromName | text | NO | NULL | - |
| fromEmail | text | NO | NULL | - |
| replyTo | text | YES | NULL | - |
| createdAt | timestamp with time zone | NO | CURRENT_TIMESTAMP | - |
| updatedAt | timestamp with time zone | NO | NULL | - |

**SAFE TO TREAT AS GLOBAL_LOOKUP**

## GO / NO-GO SUMMARY

1. **RISKY — VERIFY POLICIES**
2. **TENANT FORCE RLS UNSAFE**
3. **carrier_documents: FORCE RLS NEEDS REVIEW — POLICY CALLS uid, jwt**
4. **route_template_stops: FORCE RLS NEEDS REVIEW — POLICY CALLS jwt**
5. **stops: FORCE RLS NEEDS REVIEW — POLICY CALLS jwt, uid**
6. **TicketMessage: FORCE RLS NEEDS REVIEW — POLICY CALLS current_setting**
7. **grid_preference: MANUAL VERIFICATION NEEDED — userId has no FK**
8. **grid_view: AUTH.UID() POLICY WILL FAIL — userId references public.User.id**
9. **SAFE TO TREAT AS GLOBAL_LOOKUP**

**FINAL RECOMMENDATION: NO-GO — address flagged items before writing migration**

Items requiring attention:
- **RISKY — VERIFY POLICIES**
- **TENANT FORCE RLS UNSAFE**
- **carrier_documents: FORCE RLS NEEDS REVIEW — POLICY CALLS uid, jwt**
- **route_template_stops: FORCE RLS NEEDS REVIEW — POLICY CALLS jwt**
- **stops: FORCE RLS NEEDS REVIEW — POLICY CALLS jwt, uid**
- **TicketMessage: FORCE RLS NEEDS REVIEW — POLICY CALLS current_setting**
- **grid_preference: MANUAL VERIFICATION NEEDED — userId has no FK**
- **grid_view: AUTH.UID() POLICY WILL FAIL — userId references public.User.id**
