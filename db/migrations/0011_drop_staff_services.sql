-- Migration 0011: Fully decouple employees from services by dropping staff_services
-- This removes the obsolete staff_services relationship table and all associated indexes/constraints.
-- Tenant isolation, employees, services, and bookings are completely preserved.

DROP TABLE IF EXISTS staff_services CASCADE;
