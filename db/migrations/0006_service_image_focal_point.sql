-- Optional focal point for a service image.
--
-- The service card crops its image to fill a fixed-height banner
-- (`object-fit: cover`). The focal point records which part of the image the
-- tenant wants kept visible when that crop happens, as percentages on each axis.
--
-- Both columns are NULLABLE with no default and no backfill: NULL means
-- "centre", which is exactly the implicit `object-position: 50% 50%` that was
-- in use before this feature existed. Existing services therefore render
-- identically without being touched.

ALTER TABLE services ADD COLUMN image_focal_x smallint;
ALTER TABLE services ADD COLUMN image_focal_y smallint;

COMMENT ON COLUMN services.image_focal_x IS 'Horizontal focal point of the service image, 0-100 percent. NULL = centre.';
COMMENT ON COLUMN services.image_focal_y IS 'Vertical focal point of the service image, 0-100 percent. NULL = centre.';
