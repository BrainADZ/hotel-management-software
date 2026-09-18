import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';

// Catalog inspection only.
// Never import the application, run migrations or seed rows.
const useTest = process.argv.includes('--test');

const variable = useTest
  ? 'TEST_DATABASE_URL'
  : 'DATABASE_URL';

const url = process.env[variable];

if (!url) {
  console.error(
    `${variable} is not configured. No database connection was opened.`,
  );

  process.exitCode = 1;
} else {
  const sql = postgres(url, {
    max: 1,
    prepare: false,
    connect_timeout: 10,
    ssl:
      (
        useTest
          ? process.env.TEST_DATABASE_SSL
          : process.env.DATABASE_SSL
      ) === 'disable'
        ? false
        : 'require',
  });

  try {
    const root = new URL('../../', import.meta.url);

    const journal = JSON.parse(
      await readFile(
        new URL(
          'drizzle-postgres/meta/_journal.json',
          root,
        ),
        'utf8',
      ),
    );

    const hash = (text) =>
      createHash('sha256')
        .update(text)
        .digest('hex');

    /*
     * Only restaurant/payment migrations need to be
     * verified by this readiness script.
     */
    const expected = await Promise.all(
      journal.entries
        .filter((entry) => entry.idx >= 14)
        .map(async (entry) => {
          const source = await readFile(
            new URL(
              `drizzle-postgres/${entry.tag}.sql`,
              root,
            ),
            'utf8',
          );

          /*
           * Git can convert:
           *
           * LF   <-> CRLF
           *
           * and editors can add/remove a final newline.
           *
           * These variants do not change the SQL
           * statements, so they should not make
           * readiness fail.
           */
          const lf = source.replace(/\r\n/g, '\n');

          const withoutFinalNewline =
            lf.replace(/\n$/, '');

          const compatibleHashes = new Set([
            /*
             * Exact current file.
             */
            hash(source),

            /*
             * LF version.
             */
            hash(lf),

            /*
             * CRLF version.
             */
            hash(
              lf.replace(/\n/g, '\r\n'),
            ),

            /*
             * No final newline - LF.
             */
            hash(withoutFinalNewline),

            /*
             * No final newline - CRLF.
             */
            hash(
              withoutFinalNewline.replace(
                /\n/g,
                '\r\n',
              ),
            ),

            /*
             * One final newline - LF.
             */
            hash(
              `${withoutFinalNewline}\n`,
            ),

            /*
             * One final newline - CRLF.
             */
            hash(
              `${withoutFinalNewline}\n`.replace(
                /\n/g,
                '\r\n',
              ),
            ),
          ]);

          return {
            ...entry,
            exactHash: hash(source),
            compatibleHashes,
          };
        }),
    );

    const report = await sql.begin(
      async (tx) => {
        await tx`
          SET TRANSACTION READ ONLY
        `;

        await tx`
          SET LOCAL statement_timeout = '10s'
        `;

        const columns = await tx`
          SELECT
            table_name,
            column_name,
            is_nullable,
            column_default
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name IN (
              'restaurant_orders',
              'payments',
              'payment_refunds'
            )
        `;

        const constraints = await tx`
          SELECT
            c.conname AS name,
            pg_get_constraintdef(c.oid) AS definition
          FROM pg_constraint c
          JOIN pg_class t
            ON t.oid = c.conrelid
          JOIN pg_namespace n
            ON n.oid = t.relnamespace
          WHERE n.nspname = 'public'
            AND t.relname IN (
              'restaurant_orders',
              'payments'
            )
        `;

        const indexes = await tx`
          SELECT
            indexname AS name,
            indexdef AS definition
          FROM pg_indexes
          WHERE schemaname = 'public'
            AND tablename = 'payments'
        `;

        const [ledger] = await tx`
          SELECT
            to_regclass(
              'drizzle.__drizzle_migrations'
            ) IS NOT NULL AS present
        `;

        const applied = ledger.present
          ? await tx`
              SELECT
                hash,
                created_at
              FROM drizzle.__drizzle_migrations
              ORDER BY created_at
            `
          : [];

        const checks = [];

        const check = (
          name,
          pass,
          detail,
        ) => {
          checks.push({
            name,
            pass,
            ...(detail === undefined
              ? {}
              : { detail }),
          });
        };

        /*
         * Restaurant order columns.
         */
        for (const column of [
          'customer_name',
          'customer_phone',
          'paid_rupees',
          'settled_at',
        ]) {
          check(
            `restaurant_orders.${column}`,
            columns.some(
              (row) =>
                row.table_name ===
                  'restaurant_orders' &&
                row.column_name === column,
            ),
          );
        }

        /*
         * Payment source columns must support
         * folio and restaurant sources.
         */
        for (const column of [
          'folio_id',
          'reservation_id',
          'restaurant_order_id',
        ]) {
          check(
            `payments.${column} nullable`,
            columns.some(
              (row) =>
                row.table_name ===
                  'payments' &&
                row.column_name === column &&
                row.is_nullable === 'YES',
            ),
          );
        }

        /*
         * Required database constraints.
         */
        for (const name of [
          'payments_restaurant_order_id_restaurant_orders_id_fk',
          'chk_payments_source',
          'chk_restaurant_orders_paid_rupees',
        ]) {
          const found =
            constraints.find(
              (row) =>
                row.name === name,
            );

          check(
            name,
            Boolean(found),
            found?.definition,
          );
        }

        /*
         * Required indexes.
         */
        for (const name of [
          'idx_payments_restaurant_idempotency',
          'idx_payments_restaurant_status',
        ]) {
          const found =
            indexes.find(
              (row) =>
                row.name === name,
            );

          check(
            name,
            Boolean(found),
            found?.definition,
          );
        }

        /*
         * Migration 0015 readiness.
         *
         * Restaurant refunds may not have a folio,
         * therefore payment_refunds.folio_id
         * must be nullable.
         */
        check(
          'refund ledger accepts restaurant source',
          columns.some(
            (row) =>
              row.table_name ===
                'payment_refunds' &&
              row.column_name ===
                'folio_id' &&
              row.is_nullable === 'YES',
          ),
        );

        /*
         * Migration ledger verification.
         *
         * Exact hash is preferred.
         *
         * CRLF/LF or final-newline-only differences
         * are accepted because the SQL statements
         * remain identical.
         */
        for (
          const migration of expected
        ) {
          const row = applied.find(
            (item) =>
              String(item.created_at) ===
              String(migration.when),
          );

          if (!row) {
            check(
              `${migration.tag} recorded with matching SQL hash`,
              false,
              'NOT RECORDED',
            );

            continue;
          }

          if (
            row.hash ===
            migration.exactHash
          ) {
            check(
              `${migration.tag} recorded with matching SQL hash`,
              true,
              'MATCH',
            );

            continue;
          }

          if (
            migration.compatibleHashes.has(
              row.hash,
            )
          ) {
            check(
              `${migration.tag} recorded with matching SQL hash`,
              true,
              'MATCH (line-ending/final-newline variant; SQL statements are identical)',
            );

            continue;
          }

          check(
            `${migration.tag} recorded with matching SQL hash`,
            false,
            'HASH MISMATCH: SQL content may differ. Investigate before changing or rerunning this migration.',
          );
        }

        return {
          target: variable,
          readOnly: true,

          ready: checks.every(
            (item) => item.pass,
          ),

          checks,
        };
      },
    );

    console.log(
      JSON.stringify(
        report,
        null,
        2,
      ),
    );

    if (!report.ready) {
      process.exitCode = 1;
    }
  } catch (error) {
    /*
     * Connection errors can contain credentials
     * or database host information.
     */
    console.error(
      `Read-only readiness check failed (${
        typeof error?.code === 'string'
          ? error.code
          : 'CHECK_ERROR'
      }). No migrations or data changes were attempted.`,
    );

    process.exitCode = 1;
  } finally {
    await sql.end({
      timeout: 5,
    });
  }
}