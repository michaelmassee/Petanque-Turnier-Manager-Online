-- Organisationen können Social-Media-Links (Facebook, Instagram, X, YouTube) hinterlegen.
ALTER TABLE clubs ADD COLUMN social_links TEXT NOT NULL DEFAULT '{}';
