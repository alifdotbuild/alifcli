CREATE TABLE IF NOT EXISTS email_otps (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS email_sessions (
  public_id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  email TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_email_otps_email_created ON email_otps(email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_sessions_email ON email_sessions(email);
