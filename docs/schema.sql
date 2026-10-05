CREATE TABLE IF NOT EXISTS tracker_owner (
 id integer PRIMARY KEY CHECK(id=1), username text, password_hash text,
 totp_encrypted text NOT NULL, last_step bigint NOT NULL DEFAULT -1,
 recovery_hashes jsonb NOT NULL DEFAULT '[]', bootstrap_hash text, bootstrap_expires timestamptz,
 active boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS tracker_sessions (
 hash text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL, last_seen timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS tracker_rate_limits (
 key text PRIMARY KEY, hits integer NOT NULL, window_start timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS tracker_data (
 id integer PRIMARY KEY CHECK(id=1), version integer NOT NULL, encrypted text NOT NULL
);
CREATE TABLE IF NOT EXISTS tracker_backups (
 version integer PRIMARY KEY, encrypted text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
