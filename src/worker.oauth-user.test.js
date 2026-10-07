// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { findOrCreateOAuthUser } from './worker.js';
import { d1MitSchema } from './test-support/d1.js';

describe('OAuth-Neuanmeldung', () => {
  it('legt beim ersten Google-Login ein Konto an und liefert es ohne Fehler zurück', async () => {
    const db = d1MitSchema();
    const profile = { providerUserId: 'g-1', email: 'anna@example.test', name: 'Anna Schmidt' };

    const user = await findOrCreateOAuthUser(db, 'google', profile);

    expect(user).toMatchObject({ first_name: 'Anna', last_name: 'Schmidt', email: 'anna@example.test', role: 'user' });
    expect(db.sqlite.prepare('SELECT first_name, last_name FROM users WHERE id = ?').get(user.id))
      .toEqual({ first_name: 'Anna', last_name: 'Schmidt' });
  });
});
