// D1-Ersatz für Worker-Tests: In-Memory-SQLite mit dem echten Schema aus allen Migrationen.
// batch() läuft wie bei D1 in einer Transaktion; schlägt eine Anweisung fehl (auch per Trigger-RAISE),
// wird der ganze Batch zurückgerollt.
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

// node:sqlite kennt Vite nicht als Builtin, daher per require laden.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');

export const migrationsDir = new URL('../../migrations/', import.meta.url);

export function migrationSql(name) {
  return readFileSync(new URL(name, migrationsDir), 'utf8');
}

// vorBatch(fn): fn(sqlite) läuft einmalig direkt vor dem nächsten batch(), außerhalb von dessen Transaktion.
// Damit lässt sich eine parallele Änderung zwischen Vorab-Lesen und Batch simulieren (Race-Tests).
export function d1MitSchema() {
  const sqlite = new DatabaseSync(':memory:');
  readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
    .forEach((name) => sqlite.exec(migrationSql(name)));
  let vorNaechstemBatch = null;

  const ausfuehren = (sql, params) => {
    const prepared = sqlite.prepare(sql);
    if (/^\s*(SELECT|WITH)\b/i.test(sql) && !/\b(INSERT|UPDATE|DELETE)\b/i.test(sql)) {
      return { success: true, results: prepared.all(...params), meta: { changes: 0 } };
    }
    return { success: true, meta: { changes: prepared.run(...params).changes } };
  };

  return {
    sqlite,
    vorBatch(fn) { vorNaechstemBatch = fn; },
    prepare(sql) {
      let params = [];
      const statement = {
        bind: (...values) => { params = values; return statement; },
        run: async () => ausfuehren(sql, params),
        first: async (spalte) => {
          const zeile = sqlite.prepare(sql).get(...params) ?? null;
          return spalte && zeile ? zeile[spalte] ?? null : zeile;
        },
        all: async () => ({ results: sqlite.prepare(sql).all(...params) }),
        ausfuehren: () => ausfuehren(sql, params),
      };
      return statement;
    },
    async batch(statements) {
      if (vorNaechstemBatch) {
        const fn = vorNaechstemBatch;
        vorNaechstemBatch = null;
        fn(sqlite);
      }
      sqlite.exec('BEGIN');
      try {
        const ergebnisse = statements.map((statement) => statement.ausfuehren());
        sqlite.exec('COMMIT');
        return ergebnisse;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
}
