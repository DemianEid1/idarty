-- Add optional service image column
-- Stores a base64-encoded data URL (e.g. "data:image/png;base64,...")
-- for an optional service image shown in the booking widget.

ALTER TABLE services ADD COLUMN image text;

COMMENT ON COLUMN services.image IS 'Base64-encoded data URL for an optional service image';
