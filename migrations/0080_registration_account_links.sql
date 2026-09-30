-- Stable platform-account links for every member of a registration. Contact e-mail
-- addresses may change later, so they must not be used as the long-term Live identity.
ALTER TABLE registrations ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE registrations ADD COLUMN partner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE registrations ADD COLUMN partner2_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;

-- Backfill the unique current account match once. The stored ID remains stable when
-- either the registration contact address or the account e-mail is changed afterwards.
UPDATE registrations
SET user_id = (SELECT id FROM users WHERE lower(users.email) = lower(registrations.email))
WHERE user_id IS NULL
  AND (SELECT COUNT(*) FROM users WHERE lower(users.email) = lower(registrations.email)) = 1;

UPDATE registrations
SET partner_user_id = (SELECT id FROM users WHERE lower(users.email) = lower(registrations.partner_email))
WHERE partner_user_id IS NULL
  -- One account per person: a partner sharing the player's address stays unlinked.
  AND lower(partner_email) IS NOT lower(email)
  AND (SELECT COUNT(*) FROM users WHERE lower(users.email) = lower(registrations.partner_email)) = 1;

UPDATE registrations
SET partner2_user_id = (SELECT id FROM users WHERE lower(users.email) = lower(registrations.partner2_email))
WHERE partner2_user_id IS NULL
  AND lower(partner2_email) IS NOT lower(email)
  AND lower(partner2_email) IS NOT lower(partner_email)
  AND (SELECT COUNT(*) FROM users WHERE lower(users.email) = lower(registrations.partner2_email)) = 1;
