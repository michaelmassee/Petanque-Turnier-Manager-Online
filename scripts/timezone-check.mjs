import { zonedDateTimeToUtcIso } from '../src/worker.js';

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

if (failures > 0) process.exit(1);
console.log('\ntimezone check passed.');
