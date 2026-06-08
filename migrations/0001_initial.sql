CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  website TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS founders (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  status TEXT NOT NULL DEFAULT 'submitted',
  narrative_json TEXT NOT NULL,
  submitted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS api_tokens (
  public_id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  company_id TEXT NOT NULL REFERENCES companies(id),
  application_id TEXT NOT NULL REFERENCES applications(id),
  name TEXT NOT NULL,
  scopes TEXT NOT NULL,
  allowed_metrics TEXT,
  expires_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS metrics (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  unit TEXT NOT NULL,
  cadence TEXT NOT NULL,
  direction TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'self_reported',
  verification_level TEXT NOT NULL DEFAULT 'self_reported',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(company_id, key)
);

CREATE TABLE IF NOT EXISTS metric_points (
  id TEXT PRIMARY KEY,
  metric_id TEXT NOT NULL REFERENCES metrics(id),
  company_id TEXT NOT NULL REFERENCES companies(id),
  timestamp TEXT NOT NULL,
  value REAL NOT NULL,
  source TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.5,
  raw_event_id TEXT,
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(metric_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  metric_id TEXT NOT NULL REFERENCES metrics(id),
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  summary TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  company_id TEXT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_metric_points_metric_time ON metric_points(metric_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_company_key ON metrics(company_id, key);
CREATE INDEX IF NOT EXISTS idx_alerts_company_time ON alerts(company_id, created_at DESC);
