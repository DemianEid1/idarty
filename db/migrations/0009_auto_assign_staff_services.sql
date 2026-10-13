-- Auto-assign all active services to all active staff members for each tenant
-- so that every service has staff assigned and shows all available times.
INSERT INTO staff_services (tenant_id, staff_id, service_id)
SELECT s.tenant_id, st.id, s.id
FROM services s
JOIN staff st ON st.tenant_id = s.tenant_id AND st.is_active = true
WHERE s.is_active = true
ON CONFLICT (staff_id, service_id) DO NOTHING;
