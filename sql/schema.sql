-- Fixed Deposit rate scraper → PostgreSQL schema
-- 3 tables: banks (master), scrape_runs (one row per execution), rates (append)
-- Pattern: every scrape_run inserts a fresh batch of 247 rows; history is preserved.

BEGIN;

-- 1. Banks master — one row per bank, survives across runs
CREATE TABLE IF NOT EXISTS banks (
    bank_id       SERIAL       PRIMARY KEY,
    bank_name     TEXT         NOT NULL UNIQUE,
    source_url    TEXT         NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- 2. Scrape runs — one row per execution; tracks timing + outcome
CREATE TABLE IF NOT EXISTS scrape_runs (
    scrape_run_id      SERIAL       PRIMARY KEY,
    started_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    finished_at        TIMESTAMPTZ,
    banks_total        INT          NOT NULL DEFAULT 0,
    banks_successful   INT          NOT NULL DEFAULT 0,
    banks_failed       INT          NOT NULL DEFAULT 0,
    source_json_path   TEXT,
    scraper_version    TEXT         NOT NULL DEFAULT '1.0.0',
    notes              TEXT
);

-- 3. Rates — append-only history. One row per (run, bank, tenure, tier).
--    `tier` is NULL for the common single-rate-per-tenure case (HDFC, SBI, etc.)
--    and 1, 2, 3, ... for multi-tier banks (IndusInd, South Indian) that publish
--    different rates for the same tenure string (e.g. <3 Cr vs 3-5 Cr).
--    PG's UNIQUE indexes treat NULLs as distinct, so two single-tier rows in
--    the same (run, bank) never collide; tier-numbered rows disambiguate.
CREATE TABLE IF NOT EXISTS rates (
    rate_id              BIGSERIAL    PRIMARY KEY,
    scrape_run_id        INT          NOT NULL REFERENCES scrape_runs(scrape_run_id) ON DELETE CASCADE,
    bank_id              INT          NOT NULL REFERENCES banks(bank_id) ON DELETE RESTRICT,
    tenure               TEXT         NOT NULL,
    tier                 INT,   -- NULL = single-tier; 1, 2, 3... = multi-tier
    general_rate         NUMERIC(5,2) NOT NULL,
    senior_citizen_rate  NUMERIC(5,2) NOT NULL,
    source_url           TEXT         NOT NULL,
    scraped_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT rates_general_range_chk     CHECK (general_rate         >= 0.00 AND general_rate         <= 20.00),
    CONSTRAINT rates_senior_range_chk      CHECK (senior_citizen_rate  >= 0.00 AND senior_citizen_rate  <= 20.00),
    CONSTRAINT rates_tier_positive_chk     CHECK (tier IS NULL OR tier >= 1),
    CONSTRAINT rates_unique_per_run        UNIQUE (scrape_run_id, bank_id, tenure, tier)
);

-- Indexes for the two most common query shapes
CREATE INDEX IF NOT EXISTS rates_bank_latest_idx
    ON rates (bank_id, scrape_run_id DESC, tenure);

CREATE INDEX IF NOT EXISTS rates_scrape_run_idx
    ON rates (scrape_run_id);

-- View: "what's the current rate right now, per bank + tenure + tier"
-- LATERAL join picks the most recent scrape_run per (bank, tenure, tier).
CREATE OR REPLACE VIEW v_latest_rates AS
SELECT
    b.bank_name,
    r.tenure,
    r.tier,
    r.general_rate,
    r.senior_citizen_rate,
    r.source_url,
    r.scraped_at,
    sr.finished_at AS scrape_finished_at
FROM rates r
JOIN banks        b  ON b.bank_id       = r.bank_id
JOIN scrape_runs  sr ON sr.scrape_run_id = r.scrape_run_id
WHERE r.scrape_run_id = (
    SELECT MAX(r2.scrape_run_id)
    FROM rates r2
    WHERE r2.bank_id = r.bank_id
      AND r2.tenure  = r.tenure
      AND r2.tier IS NOT DISTINCT FROM r.tier
)
AND r.scrape_run_id = (
    SELECT MAX(r3.scrape_run_id)
    FROM rates r3
    WHERE r3.bank_id = r.bank_id
);

COMMIT;
