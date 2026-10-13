-- Crop rectangle for a service image, replacing the single-point focal control
-- with a conventional cropper.
--
-- Values are fractions of the SOURCE image (0.0000..1.0000):
--   image_crop_x / image_crop_y            top-left corner
--   image_crop_width / image_crop_height   size
--
-- All four are NULLABLE with no default and no backfill. All-NULL means "no
-- crop", which renders the whole image with `object-fit: cover` — exactly how
-- every service image behaved before this feature, so existing rows are
-- unaffected and need no migration of their data.
--
-- numeric(5,4) stores 0.0000–1.0000 exactly; it is the natural type for a
-- normalized fraction and avoids float drift when the value is round-tripped.
--
-- The legacy image_focal_x / image_focal_y columns (migration 0006) are NOT
-- dropped. They are already applied and shared, so removing them would rewrite
-- migration history; they are simply no longer exposed in the UI. A confirmed
-- crop also writes the focal point, so any reader of the old columns still works.

ALTER TABLE services ADD COLUMN image_crop_x numeric(5, 4);
ALTER TABLE services ADD COLUMN image_crop_y numeric(5, 4);
ALTER TABLE services ADD COLUMN image_crop_width numeric(5, 4);
ALTER TABLE services ADD COLUMN image_crop_height numeric(5, 4);

COMMENT ON COLUMN services.image_crop_x IS 'Service image crop: left edge as a fraction of the source image (0-1). NULL = no crop.';
COMMENT ON COLUMN services.image_crop_y IS 'Service image crop: top edge as a fraction of the source image (0-1). NULL = no crop.';
COMMENT ON COLUMN services.image_crop_width IS 'Service image crop: width as a fraction of the source image (0-1). NULL = no crop.';
COMMENT ON COLUMN services.image_crop_height IS 'Service image crop: height as a fraction of the source image (0-1). NULL = no crop.';
