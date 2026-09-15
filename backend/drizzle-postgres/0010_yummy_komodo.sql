-- Safe data migration for public hotel-facing booking and folio numbers.
-- Use this SQL as the contents of the Drizzle-generated 0010_*.sql migration.

ALTER TABLE "folios"
ADD COLUMN IF NOT EXISTS "folio_number" text;
--> statement-breakpoint

WITH reservation_base AS (
  SELECT
    r.id,
    r.property_id,
    r.created_at,
    COALESCE(
      NULLIF(
        TRIM(
          BOTH '-' FROM REGEXP_REPLACE(
            UPPER(COALESCE(p.code, '')),
            '[^A-Z0-9]+',
            '-',
            'g'
          )
        ),
        ''
      ),
      'HTL'
    ) AS property_code,
    CASE
      WHEN EXTRACT(MONTH FROM r.created_at::timestamptz) >= 4 THEN
        CONCAT(
          EXTRACT(YEAR FROM r.created_at::timestamptz)::int,
          '-',
          RIGHT(
            (EXTRACT(YEAR FROM r.created_at::timestamptz)::int + 1)::text,
            2
          )
        )
      ELSE
        CONCAT(
          EXTRACT(YEAR FROM r.created_at::timestamptz)::int - 1,
          '-',
          RIGHT(
            EXTRACT(YEAR FROM r.created_at::timestamptz)::int::text,
            2
          )
        )
    END AS financial_year
  FROM reservations r
  INNER JOIN properties p
    ON p.id = r.property_id
),
reservation_ranked AS (
  SELECT
    id,
    property_id,
    property_code,
    financial_year,
    ROW_NUMBER() OVER (
      PARTITION BY property_id, financial_year
      ORDER BY created_at, id
    ) AS sequence_value
  FROM reservation_base
)
UPDATE reservations r
SET reference = CONCAT(
  ranked.property_code,
  '-BKG/',
  ranked.financial_year,
  '/',
  LPAD(ranked.sequence_value::text, 6, '0')
)
FROM reservation_ranked ranked
WHERE r.id = ranked.id;
--> statement-breakpoint

WITH folio_base AS (
  SELECT
    f.id,
    f.property_id,
    r.created_at,
    COALESCE(
      NULLIF(
        TRIM(
          BOTH '-' FROM REGEXP_REPLACE(
            UPPER(COALESCE(p.code, '')),
            '[^A-Z0-9]+',
            '-',
            'g'
          )
        ),
        ''
      ),
      'HTL'
    ) AS property_code,
    CASE
      WHEN EXTRACT(MONTH FROM r.created_at::timestamptz) >= 4 THEN
        CONCAT(
          EXTRACT(YEAR FROM r.created_at::timestamptz)::int,
          '-',
          RIGHT(
            (EXTRACT(YEAR FROM r.created_at::timestamptz)::int + 1)::text,
            2
          )
        )
      ELSE
        CONCAT(
          EXTRACT(YEAR FROM r.created_at::timestamptz)::int - 1,
          '-',
          RIGHT(
            EXTRACT(YEAR FROM r.created_at::timestamptz)::int::text,
            2
          )
        )
    END AS financial_year
  FROM folios f
  INNER JOIN reservations r
    ON r.id = f.reservation_id
  INNER JOIN properties p
    ON p.id = f.property_id
),
folio_ranked AS (
  SELECT
    id,
    property_id,
    property_code,
    financial_year,
    ROW_NUMBER() OVER (
      PARTITION BY property_id, financial_year
      ORDER BY created_at, id
    ) AS sequence_value
  FROM folio_base
)
UPDATE folios f
SET folio_number = CONCAT(
  ranked.property_code,
  '-FOL/',
  ranked.financial_year,
  '/',
  LPAD(ranked.sequence_value::text, 6, '0')
)
FROM folio_ranked ranked
WHERE f.id = ranked.id
  AND f.folio_number IS NULL;
--> statement-breakpoint

WITH reservation_base AS (
  SELECT
    r.property_id,
    CASE
      WHEN EXTRACT(MONTH FROM r.created_at::timestamptz) >= 4 THEN
        CONCAT(
          EXTRACT(YEAR FROM r.created_at::timestamptz)::int,
          '-',
          RIGHT(
            (EXTRACT(YEAR FROM r.created_at::timestamptz)::int + 1)::text,
            2
          )
        )
      ELSE
        CONCAT(
          EXTRACT(YEAR FROM r.created_at::timestamptz)::int - 1,
          '-',
          RIGHT(
            EXTRACT(YEAR FROM r.created_at::timestamptz)::int::text,
            2
          )
        )
    END AS financial_year
  FROM reservations r
),
booking_sequences AS (
  SELECT
    property_id,
    financial_year,
    COUNT(*)::int + 1 AS next_value
  FROM reservation_base
  GROUP BY property_id, financial_year
)
INSERT INTO financial_sequences (
  property_id,
  financial_year,
  sequence_type,
  next_value
)
SELECT
  property_id,
  financial_year,
  'BOOKING',
  next_value
FROM booking_sequences
ON CONFLICT (property_id, financial_year, sequence_type)
DO UPDATE SET
  next_value = GREATEST(
    financial_sequences.next_value,
    EXCLUDED.next_value
  );
--> statement-breakpoint

WITH folio_base AS (
  SELECT
    f.property_id,
    CASE
      WHEN EXTRACT(MONTH FROM r.created_at::timestamptz) >= 4 THEN
        CONCAT(
          EXTRACT(YEAR FROM r.created_at::timestamptz)::int,
          '-',
          RIGHT(
            (EXTRACT(YEAR FROM r.created_at::timestamptz)::int + 1)::text,
            2
          )
        )
      ELSE
        CONCAT(
          EXTRACT(YEAR FROM r.created_at::timestamptz)::int - 1,
          '-',
          RIGHT(
            EXTRACT(YEAR FROM r.created_at::timestamptz)::int::text,
            2
          )
        )
    END AS financial_year
  FROM folios f
  INNER JOIN reservations r
    ON r.id = f.reservation_id
),
folio_sequences AS (
  SELECT
    property_id,
    financial_year,
    COUNT(*)::int + 1 AS next_value
  FROM folio_base
  GROUP BY property_id, financial_year
)
INSERT INTO financial_sequences (
  property_id,
  financial_year,
  sequence_type,
  next_value
)
SELECT
  property_id,
  financial_year,
  'FOLIO',
  next_value
FROM folio_sequences
ON CONFLICT (property_id, financial_year, sequence_type)
DO UPDATE SET
  next_value = GREATEST(
    financial_sequences.next_value,
    EXCLUDED.next_value
  );
--> statement-breakpoint

ALTER TABLE "folios"
ALTER COLUMN "folio_number" SET NOT NULL;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "idx_folios_property_number"
ON "folios" USING btree ("property_id", "folio_number");
