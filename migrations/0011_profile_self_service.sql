ALTER TABLE users ADD COLUMN pending_email TEXT;
ALTER TABLE email_verification_tokens ADD COLUMN new_email TEXT;
