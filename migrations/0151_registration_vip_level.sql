-- VIP-Stufen (Issue #34): 3 = Gold, 2 = Silber, 1 = Bronze, 0 = ohne VIP. Bestehende VIPs werden Gold.
-- is_vip bleibt als abgeleitetes Feld (vip_level > 0) für ältere Clients bestehen.
ALTER TABLE registrations ADD COLUMN vip_level INTEGER NOT NULL DEFAULT 0;
UPDATE registrations SET vip_level = 3 WHERE is_vip = 1;
