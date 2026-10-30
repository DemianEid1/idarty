-- Migration 0015: Per-branch Google Maps links
--
-- Each branch can point customers to its own location on Google Maps. The
-- column is nullable: branches without a link simply render no map action.

ALTER TABLE branches ADD COLUMN IF NOT EXISTS google_maps_url text;
