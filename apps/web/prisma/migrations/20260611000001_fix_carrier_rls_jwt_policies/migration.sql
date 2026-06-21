-- Migration: Fix Carrier RLS JWT Policies
--
-- Problem: The carrier tables have conflicting RLS policies:
--   1. Old policies (migration 20260404100013) use auth.jwt() ->> 'org_id'
--   2. New policies (migration 20260515000001) use current_tenant_id() GUC
--
-- For INSERT/UPDATE/DELETE, PostgreSQL requires ALL policies to pass.
-- Since auth.jwt() returns NULL in direct DB connections (app uses session pooler),
-- the old policies block all mutations even though the new policies would allow them.
--
-- Fix: Drop the old JWT-based policies. The tenant_isolation_policy using
-- current_tenant_id() provides proper tenant isolation for direct connections.

-- ============================================================================
-- carrier_trucks
-- ============================================================================
DROP POLICY IF EXISTS carrier_trucks_org_select ON carrier_trucks;
DROP POLICY IF EXISTS carrier_trucks_org_insert ON carrier_trucks;
DROP POLICY IF EXISTS carrier_trucks_org_update ON carrier_trucks;
DROP POLICY IF EXISTS carrier_trucks_org_delete ON carrier_trucks;

-- ============================================================================
-- carrier_drivers
-- ============================================================================
DROP POLICY IF EXISTS carrier_drivers_org_select ON carrier_drivers;
DROP POLICY IF EXISTS carrier_drivers_org_insert ON carrier_drivers;
DROP POLICY IF EXISTS carrier_drivers_org_update ON carrier_drivers;
DROP POLICY IF EXISTS carrier_drivers_org_delete ON carrier_drivers;
DROP POLICY IF EXISTS carrier_drivers_driver_self_select ON carrier_drivers;

-- ============================================================================
-- carrier_expenses
-- ============================================================================
DROP POLICY IF EXISTS carrier_expenses_org_select ON carrier_expenses;
DROP POLICY IF EXISTS carrier_expenses_org_insert ON carrier_expenses;
DROP POLICY IF EXISTS carrier_expenses_org_update ON carrier_expenses;
DROP POLICY IF EXISTS carrier_expenses_org_delete ON carrier_expenses;
DROP POLICY IF EXISTS carrier_expenses_driver_select ON carrier_expenses;
DROP POLICY IF EXISTS carrier_expenses_driver_insert ON carrier_expenses;

-- ============================================================================
-- driver_pay_records
-- ============================================================================
DROP POLICY IF EXISTS driver_pay_records_org_select ON driver_pay_records;
DROP POLICY IF EXISTS driver_pay_records_org_insert ON driver_pay_records;
DROP POLICY IF EXISTS driver_pay_records_org_update ON driver_pay_records;
DROP POLICY IF EXISTS driver_pay_records_org_delete ON driver_pay_records;
DROP POLICY IF EXISTS driver_pay_records_driver_select ON driver_pay_records;

-- ============================================================================
-- clients
-- ============================================================================
DROP POLICY IF EXISTS clients_org_select ON clients;
DROP POLICY IF EXISTS clients_owner_insert ON clients;
DROP POLICY IF EXISTS clients_owner_manager_update ON clients;
DROP POLICY IF EXISTS clients_owner_delete ON clients;

-- ============================================================================
-- contracts
-- ============================================================================
DROP POLICY IF EXISTS contracts_org_select ON contracts;
DROP POLICY IF EXISTS contracts_owner_insert ON contracts;
DROP POLICY IF EXISTS contracts_owner_update ON contracts;
DROP POLICY IF EXISTS contracts_owner_delete ON contracts;

-- ============================================================================
-- facilities
-- ============================================================================
DROP POLICY IF EXISTS facilities_org_select ON facilities;
DROP POLICY IF EXISTS facilities_org_insert ON facilities;
DROP POLICY IF EXISTS facilities_org_update ON facilities;
DROP POLICY IF EXISTS facilities_org_delete ON facilities;

-- ============================================================================
-- route_templates
-- ============================================================================
DROP POLICY IF EXISTS route_templates_org_select ON route_templates;
DROP POLICY IF EXISTS route_templates_org_insert ON route_templates;
DROP POLICY IF EXISTS route_templates_org_update ON route_templates;
DROP POLICY IF EXISTS route_templates_org_delete ON route_templates;

-- ============================================================================
-- route_template_stops
-- ============================================================================
DROP POLICY IF EXISTS route_template_stops_org_select ON route_template_stops;
DROP POLICY IF EXISTS route_template_stops_org_insert ON route_template_stops;
DROP POLICY IF EXISTS route_template_stops_org_update ON route_template_stops;
DROP POLICY IF EXISTS route_template_stops_org_delete ON route_template_stops;

-- ============================================================================
-- dispatches (now renamed to trips, but policy names might still reference dispatches)
-- ============================================================================
DROP POLICY IF EXISTS dispatches_org_select ON dispatches;
DROP POLICY IF EXISTS dispatches_org_insert ON dispatches;
DROP POLICY IF EXISTS dispatches_org_update ON dispatches;
DROP POLICY IF EXISTS dispatches_org_delete ON dispatches;

-- ============================================================================
-- loads
-- ============================================================================
DROP POLICY IF EXISTS loads_org_select ON loads;
DROP POLICY IF EXISTS loads_org_insert ON loads;
DROP POLICY IF EXISTS loads_org_update ON loads;
DROP POLICY IF EXISTS loads_org_delete ON loads;
DROP POLICY IF EXISTS loads_driver_select ON loads;

-- ============================================================================
-- stops
-- ============================================================================
DROP POLICY IF EXISTS stops_org_select ON stops;
DROP POLICY IF EXISTS stops_org_insert ON stops;
DROP POLICY IF EXISTS stops_org_update ON stops;
DROP POLICY IF EXISTS stops_org_delete ON stops;
DROP POLICY IF EXISTS stops_driver_select ON stops;
DROP POLICY IF EXISTS stops_driver_update ON stops;

-- ============================================================================
-- carrier_documents
-- ============================================================================
DROP POLICY IF EXISTS carrier_documents_select ON carrier_documents;
DROP POLICY IF EXISTS carrier_documents_insert ON carrier_documents;
DROP POLICY IF EXISTS carrier_documents_org_update ON carrier_documents;
DROP POLICY IF EXISTS carrier_documents_org_delete ON carrier_documents;
