import { zonedDateTimeToUtcIso, registrationOpenStatus } from '../src/worker.js';

let failures = 0;

function expectEqual(label, actual, expected) {
  if (actual === expected) {
    console.log(`ok   ${label}`);
    return;
  }
  failures += 1;
  console.error(`FAIL ${label}: expected ${expected}, got ${actual}`);
}

function expectInvalid(label, callback) {
  try {
    callback();
    failures += 1;
    console.error(`FAIL ${label}: expected an error`);
  } catch {
    console.log(`ok   ${label}`);
  }
}

expectEqual('Berlin summer time', zonedDateTimeToUtcIso('2026-06-01T20:14', 'Europe/Berlin'), '2026-06-01T18:14:00.000Z');
expectEqual('New York summer time', zonedDateTimeToUtcIso('2026-06-01T20:14', 'America/New_York'), '2026-06-02T00:14:00.000Z');
expectEqual('Sydney standard time', zonedDateTimeToUtcIso('2026-06-01T20:14', 'Australia/Sydney'), '2026-06-01T10:14:00.000Z');
expectInvalid('Berlin DST gap rejected', () => zonedDateTimeToUtcIso('2026-03-29T02:30', 'Europe/Berlin'));
expectEqual('Berlin DST overlap uses first instant', zonedDateTimeToUtcIso('2026-10-25T02:30', 'Europe/Berlin'), '2026-10-25T00:30:00.000Z');

// --- Freischaltung zu einer bestimmten Uhrzeit: registrierungsstart ist eine
// Ortszeit am Turnierstandort, muss aber unabhängig von der Zeitzone des
// Betrachters/Servers exakt zum richtigen UTC-Zeitpunkt öffnen. ---

// Turnier "öffnet" am 04.09.2026 um 20:14 Ortszeit in Berlin (Sommerzeit, UTC+2)
// -> UTC-Instant 18:14:00Z, das die App tatsächlich in der DB speichert.
const opensAtUtc = zonedDateTimeToUtcIso('2026-09-04T20:14', 'Europe/Berlin');
const baseTournament = {
  visibility: 'public',
  status: 'registration',
  registration_opens_at: opensAtUtc,
  registration_deadline: null,
};

expectEqual(
  'eine Minute vor Öffnung gesperrt',
  registrationOpenStatus(baseTournament, new Date('2026-09-04T18:13:00.000Z')),
  'not_yet_open',
);
expectEqual(
  'exakt zum Öffnungszeitpunkt freigeschaltet',
  registrationOpenStatus(baseTournament, new Date(opensAtUtc)),
  'open',
);
expectEqual(
  'eine Minute nach Öffnung weiterhin freigeschaltet',
  registrationOpenStatus(baseTournament, new Date('2026-09-04T18:15:00.000Z')),
  'open',
);

// Derselbe UTC-Instant, unabhängig davon, in welcher Zeitzone er ausgedrückt wird
// (Date-Objekte selbst tragen keine Zeitzone) - der Betrachter-Standort darf das
// Ergebnis nicht verändern.
const sameInstantFromSydney = new Date('2026-09-05T04:14:00.000+10:00'); // == 2026-09-04T18:14:00.000Z
const sameInstantFromNewYork = new Date('2026-09-04T14:14:00.000-04:00'); // == 2026-09-04T18:14:00.000Z
expectEqual(
  'Öffnungszeitpunkt aus Sicht Sydney identisch',
  registrationOpenStatus(baseTournament, sameInstantFromSydney),
  'open',
);
expectEqual(
  'Öffnungszeitpunkt aus Sicht New York identisch',
  registrationOpenStatus(baseTournament, sameInstantFromNewYork),
  'open',
);

// Meldefrist abgelaufen hat Vorrang, auch wenn die Anmeldung längst offen war.
const withPassedDeadline = {
  ...baseTournament,
  registration_deadline: zonedDateTimeToUtcIso('2026-09-06T09:00', 'Europe/Berlin'),
};
expectEqual(
  'vor der Meldefrist noch offen',
  registrationOpenStatus(withPassedDeadline, new Date('2026-09-06T06:59:00.000Z')),
  'open',
);
expectEqual(
  'nach der Meldefrist geschlossen',
  registrationOpenStatus(withPassedDeadline, new Date('2026-09-06T07:01:00.000Z')),
  'deadline_passed',
);

// Privates bzw. nicht auf "registration" stehendes Turnier bleibt unabhängig von
// den Zeitfenstern geschlossen.
expectEqual(
  'privates Turnier bleibt geschlossen',
  registrationOpenStatus({ ...baseTournament, visibility: 'private' }, new Date(opensAtUtc)),
  'closed',
);
expectEqual(
  'Turnierstatus "running" bleibt geschlossen',
  registrationOpenStatus({ ...baseTournament, status: 'running' }, new Date(opensAtUtc)),
  'closed',
);

if (failures > 0) process.exit(1);
console.log('\ntimezone check passed.');
