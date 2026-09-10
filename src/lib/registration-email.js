export const PLACEHOLDER_EMAIL_DOMAIN = 'ohne-email.invalid';

export function createPlaceholderEmail() {
  return `ohne-email-${crypto.randomUUID()}@${PLACEHOLDER_EMAIL_DOMAIN}`;
}

export function isPlaceholderEmail(email) {
  return typeof email === 'string' && email.toLowerCase().endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`);
}
