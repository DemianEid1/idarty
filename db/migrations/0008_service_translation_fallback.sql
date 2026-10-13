-- Backfill missing service translations so that every service has entries for both 'ar' and 'en'.
-- Services created only in Arabic get an initial English translation entry with the same name and description,
-- ensuring they render their real names instead of placeholders on the English site and booking flow.
INSERT INTO service_translations (tenant_id, service_id, locale, name, description)
SELECT st.tenant_id, st.service_id, 'en'::app_locale, st.name, st.description
FROM service_translations st
WHERE st.locale = 'ar'
ON CONFLICT (service_id, locale) DO NOTHING;

INSERT INTO service_translations (tenant_id, service_id, locale, name, description)
SELECT st.tenant_id, st.service_id, 'ar'::app_locale, st.name, st.description
FROM service_translations st
WHERE st.locale = 'en'
ON CONFLICT (service_id, locale) DO NOTHING;

-- Backfill missing staff translations so that every staff member has entries for both 'ar' and 'en'
INSERT INTO staff_translations (tenant_id, staff_id, locale, name, title, bio)
SELECT st.tenant_id, st.staff_id, 'en'::app_locale, st.name, st.title, st.bio
FROM staff_translations st
WHERE st.locale = 'ar'
ON CONFLICT (staff_id, locale) DO NOTHING;

INSERT INTO staff_translations (tenant_id, staff_id, locale, name, title, bio)
SELECT st.tenant_id, st.staff_id, 'ar'::app_locale, st.name, st.title, st.bio
FROM staff_translations st
WHERE st.locale = 'en'
ON CONFLICT (staff_id, locale) DO NOTHING;
