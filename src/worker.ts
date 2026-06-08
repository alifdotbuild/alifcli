export interface Env {
  DB: D1Database;
  METRIC_QUEUE?: Queue<MetricEvent>;
  EMAIL?: EmailSender;
  ALIF_ENV?: string;
  SIGNUP_SECRET?: string;
  REQUIRE_EMAIL_OTP?: string;
  OTP_FROM_EMAIL?: string;
  OTP_FROM_NAME?: string;
}

type TokenRecord = {
  public_id: string;
  token_hash: string;
  company_id: string;
  application_id: string;
  name: string;
  scopes: string;
  allowed_metrics: string | null;
  expires_at: string | null;
  revoked_at: string | null;
};

type SessionRecord = {
  public_id: string;
  token_hash: string;
  email: string;
  expires_at: string;
  revoked_at: string | null;
};

type EmailSender = {
  send(message: {
    to: string;
    from: { email: string; name?: string };
    subject: string;
    text: string;
    html?: string;
  }): Promise<unknown>;
};

type MetricEvent = {
  companyId: string;
  metricId: string;
  pointId: string;
};

type AuthedRequest = {
  token: TokenRecord;
  scopes: Set<string>;
  allowedMetrics: Set<string> | null;
};

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8"
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    try {
      if (request.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders() });
      }

      if (url.pathname === "/health") {
        return json({ ok: true, env: env.ALIF_ENV ?? "unknown" });
      }

      if (request.method === "POST" && url.pathname === "/v1/auth/otp/start") {
        return startEmailOtp(request, env);
      }

      if (request.method === "POST" && url.pathname === "/v1/auth/otp/verify") {
        return verifyEmailOtp(request, env);
      }

      if (request.method === "POST" && url.pathname === "/v1/applications") {
        return createApplication(request, env);
      }

      if (request.method === "GET" && url.pathname === "/v1/status") {
        const auth = await requireAuth(request, env, "application:read");
        return getStatus(env, auth);
      }

      if (request.method === "POST" && url.pathname === "/v1/metrics") {
        const auth = await requireAuth(request, env, "metrics:create");
        return createMetric(request, env, auth);
      }

      const pointMatch = url.pathname.match(/^\/v1\/metrics\/([^/]+)\/points$/);
      if (request.method === "POST" && pointMatch) {
        const auth = await requireAuth(request, env, "metrics:write");
        return createMetricPoint(request, env, auth, decodeURIComponent(pointMatch[1]));
      }

      return json({ error: "not_found" }, 404);
    } catch (error) {
      if (error instanceof HttpError) {
        return json({ error: error.code, message: error.message }, error.status);
      }

      console.error(error);
      return json({ error: "internal_error" }, 500);
    }
  },

  async queue(batch: MessageBatch<MetricEvent>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      await evaluateMetricAlert(env, message.body);
      message.ack();
    }
  },

  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    await env.DB.prepare(
      `INSERT INTO audit_log (id, actor, action, resource_type, metadata_json)
       VALUES (?, 'system', 'scheduled_tick', 'worker', ?)`
    )
      .bind(id("audit"), JSON.stringify({ note: "reserved for source sync jobs" }))
      .run();
  }
};

async function createApplication(request: Request, env: Env): Promise<Response> {
  const session = await optionalSession(request, env);
  if (env.SIGNUP_SECRET) {
    const presented = request.headers.get("x-alif-signup-secret");
    if (presented !== env.SIGNUP_SECRET) {
      throw new HttpError(401, "unauthorized", "Invalid signup secret.");
    }
  } else if (env.REQUIRE_EMAIL_OTP === "true" && !session) {
    throw new HttpError(401, "email_otp_required", "Run `alif login` before applying.");
  }

  const body = await readJson<{
    company_name?: string;
    website?: string;
    founder_name?: string;
    founder_email?: string;
    narrative?: Record<string, unknown>;
    primary_metric?: {
      key?: string;
      display_name?: string;
      unit?: string;
      cadence?: string;
      direction?: string;
    };
  }>(request);

  const companyName = requireString(body.company_name, "company_name");
  const founderName = requireString(body.founder_name, "founder_name");
  const founderEmail = normalizeEmail(requireString(body.founder_email, "founder_email"));
  if (session && founderEmail !== session.email) {
    throw new HttpError(403, "email_mismatch", "Founder email must match the verified login email.");
  }
  const narrative = body.narrative ?? {};
  const companyId = id("co");
  const founderId = id("founder");
  const applicationId = id("app");
  const token = await issueToken(env, {
    companyId,
    applicationId,
    name: "default-agent-token",
    scopes: ["application:read", "metrics:create", "metrics:write"],
    allowedMetrics: null,
    expiresAt: null
  });

  const statements = [
    env.DB.prepare("INSERT INTO companies (id, name, website) VALUES (?, ?, ?)")
      .bind(companyId, companyName, body.website ?? null),
    env.DB.prepare("INSERT INTO founders (id, company_id, email, name) VALUES (?, ?, ?, ?)")
      .bind(founderId, companyId, founderEmail, founderName),
    env.DB.prepare("INSERT INTO applications (id, company_id, narrative_json) VALUES (?, ?, ?)")
      .bind(applicationId, companyId, JSON.stringify(narrative)),
    env.DB.prepare(
      `INSERT INTO api_tokens
       (public_id, token_hash, company_id, application_id, name, scopes, allowed_metrics, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      token.publicId,
      token.hash,
      companyId,
      applicationId,
      "default-agent-token",
      token.scopes,
      null,
      null
    ),
    env.DB.prepare(
      `INSERT INTO audit_log (id, company_id, actor, action, resource_type, resource_id, metadata_json)
       VALUES (?, ?, ?, 'application.created', 'application', ?, ?)`
    ).bind(id("audit"), companyId, founderEmail, applicationId, "{}")
  ];

  const metric = body.primary_metric;
  if (metric?.key) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO metrics
         (id, company_id, key, display_name, unit, cadence, direction)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id("metric"),
        companyId,
        slug(metric.key),
        metric.display_name ?? titleize(metric.key),
        metric.unit ?? "count",
        metric.cadence ?? "weekly",
        metric.direction ?? "up"
      )
    );
  }

  await env.DB.batch(statements);

  return json({
    company_id: companyId,
    application_id: applicationId,
    founder_email_verified: Boolean(session),
    token: token.raw,
    token_scopes: token.scopes.split(" ")
  }, 201);
}

async function startEmailOtp(request: Request, env: Env): Promise<Response> {
  const body = await readJson<{ email?: string }>(request);
  const email = normalizeEmail(requireString(body.email, "email"));

  const recent = await env.DB.prepare(
    `SELECT COUNT(*) AS count
     FROM email_otps
     WHERE email = ?
       AND created_at > datetime('now', '-10 minutes')`
  ).bind(email).first<{ count: number }>();
  if ((recent?.count ?? 0) >= 5) {
    throw new HttpError(429, "otp_rate_limited", "Too many OTP requests. Try again later.");
  }

  const code = randomOtp();
  const otpId = id("otp");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await env.DB.prepare(
    `INSERT INTO email_otps (id, email, code_hash, expires_at)
     VALUES (?, ?, ?, ?)`
  ).bind(otpId, email, await sha256(`${email}:${code}`), expiresAt).run();

  const sent = await sendOtpEmail(env, email, code);
  await env.DB.prepare(
    `INSERT INTO audit_log (id, actor, action, resource_type, resource_id, metadata_json)
     VALUES (?, ?, 'auth.otp.started', 'email_otp', ?, ?)`
  ).bind(id("audit"), email, otpId, JSON.stringify({ sent })).run();

  const payload: Record<string, unknown> = {
    ok: true,
    email,
    expires_at: expiresAt,
    delivery: sent ? "email" : "development_response"
  };
  if (!sent) payload.dev_otp = code;
  return json(payload);
}

async function verifyEmailOtp(request: Request, env: Env): Promise<Response> {
  const body = await readJson<{ email?: string; code?: string }>(request);
  const email = normalizeEmail(requireString(body.email, "email"));
  const code = requireString(body.code, "code").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(code)) {
    throw new HttpError(400, "invalid_otp", "OTP code must be 6 digits.");
  }

  const otp = await env.DB.prepare(
    `SELECT id, code_hash, expires_at, attempts
     FROM email_otps
     WHERE email = ? AND consumed_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`
  ).bind(email).first<{ id: string; code_hash: string; expires_at: string; attempts: number }>();

  if (!otp) throw new HttpError(401, "invalid_otp", "Invalid or expired OTP.");
  if (Date.parse(otp.expires_at) <= Date.now()) {
    throw new HttpError(401, "expired_otp", "OTP expired. Request a new code.");
  }
  if (otp.attempts >= 5) {
    throw new HttpError(429, "otp_attempts_exceeded", "Too many attempts. Request a new code.");
  }

  const codeHash = await sha256(`${email}:${code}`);
  if (!timingSafeEqual(codeHash, otp.code_hash)) {
    await env.DB.prepare("UPDATE email_otps SET attempts = attempts + 1 WHERE id = ?").bind(otp.id).run();
    throw new HttpError(401, "invalid_otp", "Invalid OTP.");
  }

  const session = await issueSession(email);
  await env.DB.batch([
    env.DB.prepare("UPDATE email_otps SET consumed_at = ? WHERE id = ?").bind(new Date().toISOString(), otp.id),
    env.DB.prepare(
      `INSERT INTO email_sessions (public_id, token_hash, email, expires_at)
       VALUES (?, ?, ?, ?)`
    ).bind(session.publicId, session.hash, email, session.expiresAt),
    env.DB.prepare(
      `INSERT INTO audit_log (id, actor, action, resource_type, resource_id, metadata_json)
       VALUES (?, ?, 'auth.otp.verified', 'email_session', ?, ?)`
    ).bind(id("audit"), email, session.publicId, "{}")
  ]);

  return json({
    ok: true,
    email,
    session_token: session.raw,
    expires_at: session.expiresAt
  });
}

async function getStatus(env: Env, auth: AuthedRequest): Promise<Response> {
  const application = await env.DB.prepare(
    `SELECT a.id, a.status, a.submitted_at, c.name AS company_name, c.website
     FROM applications a
     JOIN companies c ON c.id = a.company_id
     WHERE a.id = ? AND a.company_id = ?`
  ).bind(auth.token.application_id, auth.token.company_id).first();

  const metrics = await env.DB.prepare(
    `SELECT m.key, m.display_name, m.unit, m.cadence, m.direction, m.verification_level,
            p.value AS latest_value, p.timestamp AS latest_timestamp
     FROM metrics m
     LEFT JOIN metric_points p ON p.id = (
       SELECT id FROM metric_points
       WHERE metric_id = m.id
       ORDER BY timestamp DESC, created_at DESC
       LIMIT 1
     )
     WHERE m.company_id = ?
     ORDER BY m.created_at ASC`
  ).bind(auth.token.company_id).all();

  const alerts = await env.DB.prepare(
    `SELECT alert_type, severity, summary, created_at
     FROM alerts
     WHERE company_id = ?
     ORDER BY created_at DESC
     LIMIT 10`
  ).bind(auth.token.company_id).all();

  return json({ application, metrics: metrics.results, alerts: alerts.results });
}

async function createMetric(request: Request, env: Env, auth: AuthedRequest): Promise<Response> {
  const body = await readJson<{
    key?: string;
    display_name?: string;
    unit?: string;
    cadence?: string;
    direction?: string;
    source_type?: string;
  }>(request);

  const key = slug(requireString(body.key, "key"));
  const metricId = id("metric");

  await env.DB.prepare(
    `INSERT INTO metrics
     (id, company_id, key, display_name, unit, cadence, direction, source_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    metricId,
    auth.token.company_id,
    key,
    body.display_name ?? titleize(key),
    body.unit ?? "count",
    body.cadence ?? "weekly",
    body.direction ?? "up",
    body.source_type ?? "self_reported"
  ).run();

  await audit(env, auth, "metric.created", "metric", metricId, { key });

  return json({ id: metricId, key }, 201);
}

async function createMetricPoint(
  request: Request,
  env: Env,
  auth: AuthedRequest,
  metricKey: string
): Promise<Response> {
  const key = slug(metricKey);
  if (auth.allowedMetrics && !auth.allowedMetrics.has(key)) {
    throw new HttpError(403, "forbidden", "Token is not allowed to write this metric.");
  }

  const body = await readJson<{
    value?: number;
    timestamp?: string;
    source?: string;
    confidence?: number;
    raw_event_id?: string;
    idempotency_key?: string;
  }>(request);

  if (typeof body.value !== "number" || !Number.isFinite(body.value)) {
    throw new HttpError(400, "invalid_value", "value must be a finite number.");
  }

  const timestamp = body.timestamp ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(timestamp))) {
    throw new HttpError(400, "invalid_timestamp", "timestamp must be an ISO date.");
  }

  const metric = await env.DB.prepare(
    "SELECT id FROM metrics WHERE company_id = ? AND key = ?"
  ).bind(auth.token.company_id, key).first<{ id: string }>();

  if (!metric) {
    throw new HttpError(404, "metric_not_found", "Create the metric before writing points.");
  }

  const idempotencyKey = request.headers.get("idempotency-key")
    ?? body.idempotency_key
    ?? `${auth.token.company_id}:${key}:${timestamp}`;
  const pointId = id("point");

  try {
    await env.DB.prepare(
      `INSERT INTO metric_points
       (id, metric_id, company_id, timestamp, value, source, confidence, raw_event_id, idempotency_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      pointId,
      metric.id,
      auth.token.company_id,
      timestamp,
      body.value,
      body.source ?? auth.token.name,
      body.confidence ?? 0.5,
      body.raw_event_id ?? null,
      idempotencyKey
    ).run();
  } catch (error) {
    if (String(error).includes("UNIQUE constraint failed")) {
      const existing = await env.DB.prepare(
        "SELECT id FROM metric_points WHERE metric_id = ? AND idempotency_key = ?"
      ).bind(metric.id, idempotencyKey).first();
      return json({ id: existing?.id, duplicate: true }, 200);
    }
    throw error;
  }

  await audit(env, auth, "metric_point.created", "metric_point", pointId, { key, value: body.value });
  await env.METRIC_QUEUE?.send({ companyId: auth.token.company_id, metricId: metric.id, pointId });

  return json({ id: pointId, duplicate: false }, 201);
}

async function evaluateMetricAlert(env: Env, event: MetricEvent): Promise<void> {
  const rows = await env.DB.prepare(
    `SELECT id, value, timestamp
     FROM metric_points
     WHERE metric_id = ?
     ORDER BY timestamp DESC, created_at DESC
     LIMIT 3`
  ).bind(event.metricId).all<{ id: string; value: number; timestamp: string }>();

  const points = rows.results;
  if (points.length < 2) return;

  const [latest, previous] = points;
  if (latest.id !== event.pointId) return;
  if (previous.value <= 0) return;

  const growth = (latest.value - previous.value) / previous.value;
  if (growth < 0.5) return;

  const metric = await env.DB.prepare(
    "SELECT display_name FROM metrics WHERE id = ?"
  ).bind(event.metricId).first<{ display_name: string }>();

  await env.DB.prepare(
    `INSERT INTO alerts (id, company_id, metric_id, alert_type, severity, summary)
     VALUES (?, ?, ?, 'growth_spike', 'high', ?)`
  ).bind(
    id("alert"),
    event.companyId,
    event.metricId,
    `${metric?.display_name ?? "Metric"} increased ${(growth * 100).toFixed(0)}% from ${previous.value} to ${latest.value}.`
  ).run();
}

async function requireAuth(request: Request, env: Env, requiredScope: string): Promise<AuthedRequest> {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new HttpError(401, "missing_token", "Missing bearer token.");

  const parsed = parseToken(token);
  const record = await env.DB.prepare(
    "SELECT * FROM api_tokens WHERE public_id = ?"
  ).bind(parsed.publicId).first<TokenRecord>();

  if (!record || record.revoked_at) {
    throw new HttpError(401, "invalid_token", "Invalid token.");
  }
  if (record.expires_at && Date.parse(record.expires_at) <= Date.now()) {
    throw new HttpError(401, "expired_token", "Expired token.");
  }

  const hash = await sha256(parsed.secret);
  if (!timingSafeEqual(hash, record.token_hash)) {
    throw new HttpError(401, "invalid_token", "Invalid token.");
  }

  const scopes = new Set(record.scopes.split(/\s+/).filter(Boolean));
  if (!scopes.has(requiredScope)) {
    throw new HttpError(403, "missing_scope", `Token requires ${requiredScope}.`);
  }

  return {
    token: record,
    scopes,
    allowedMetrics: record.allowed_metrics
      ? new Set(record.allowed_metrics.split(/\s+/).filter(Boolean))
      : null
  };
}

async function optionalSession(request: Request, env: Env): Promise<SessionRecord | null> {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token?.startsWith("alif_session_")) return null;
  return requireSession(token, env);
}

async function requireSession(raw: string, env: Env): Promise<SessionRecord> {
  const parsed = parseSessionToken(raw);
  const record = await env.DB.prepare(
    "SELECT * FROM email_sessions WHERE public_id = ?"
  ).bind(parsed.publicId).first<SessionRecord>();

  if (!record || record.revoked_at) {
    throw new HttpError(401, "invalid_session", "Invalid session.");
  }
  if (Date.parse(record.expires_at) <= Date.now()) {
    throw new HttpError(401, "expired_session", "Session expired. Run `alif login` again.");
  }

  const hash = await sha256(parsed.secret);
  if (!timingSafeEqual(hash, record.token_hash)) {
    throw new HttpError(401, "invalid_session", "Invalid session.");
  }

  return record;
}

async function issueToken(
  _env: Env,
  input: {
    companyId: string;
    applicationId: string;
    name: string;
    scopes: string[];
    allowedMetrics: string[] | null;
    expiresAt: string | null;
  }
): Promise<{ publicId: string; raw: string; hash: string; scopes: string }> {
  const publicId = randomHex(9);
  const secret = randomBase64Url(32);
  const raw = `alif_live_${publicId}_${secret}`;
  return {
    publicId,
    raw,
    hash: await sha256(secret),
    scopes: input.scopes.join(" ")
  };
}

async function issueSession(email: string): Promise<{ publicId: string; raw: string; hash: string; expiresAt: string }> {
  const publicId = randomHex(9);
  const secret = randomBase64Url(32);
  const raw = `alif_session_${publicId}_${secret}`;
  return {
    publicId,
    raw,
    hash: await sha256(secret),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  };
}

function parseToken(raw: string): { publicId: string; secret: string } {
  const match = raw.match(/^alif_live_([a-f0-9]+)_(.+)$/);
  if (!match) throw new HttpError(401, "invalid_token", "Invalid token format.");
  return { publicId: match[1], secret: match[2] };
}

function parseSessionToken(raw: string): { publicId: string; secret: string } {
  const match = raw.match(/^alif_session_([a-f0-9]+)_(.+)$/);
  if (!match) throw new HttpError(401, "invalid_session", "Invalid session format.");
  return { publicId: match[1], secret: match[2] };
}

async function audit(
  env: Env,
  auth: AuthedRequest,
  action: string,
  resourceType: string,
  resourceId: string,
  metadata: Record<string, unknown>
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO audit_log
     (id, company_id, actor, action, resource_type, resource_id, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id("audit"),
    auth.token.company_id,
    auth.token.name,
    action,
    resourceType,
    resourceId,
    JSON.stringify(metadata)
  ).run();
}

async function readJson<T>(request: Request): Promise<T> {
  try {
    return await request.json() as T;
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must be valid JSON.");
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpError(400, "missing_field", `${field} is required.`);
  }
  return value.trim();
}

function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, "invalid_email", "Email must be valid.");
  }
  return email;
}

function slug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function titleize(value: string): string {
  return slug(value).split("_").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ");
}

function id(prefix: string): string {
  return `${prefix}_${randomBase64Url(12)}`;
}

function randomBase64Url(bytes: number): string {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return btoa(String.fromCharCode(...data)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomHex(bytes: number): string {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return [...data].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomOtp(): string {
  const data = new Uint8Array(4);
  crypto.getRandomValues(data);
  const value = new DataView(data.buffer).getUint32(0) % 1_000_000;
  return value.toString().padStart(6, "0");
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sendOtpEmail(env: Env, email: string, code: string): Promise<boolean> {
  if (!env.EMAIL || !env.OTP_FROM_EMAIL) return false;

  const fromName = env.OTP_FROM_NAME ?? "Alif";
  const text = `Your Alif login code is ${code}. It expires in 10 minutes.`;
  await env.EMAIL.send({
    to: email,
    from: { email: env.OTP_FROM_EMAIL, name: fromName },
    subject: "Your Alif login code",
    text,
    html: `<p>Your Alif login code is <strong>${code}</strong>.</p><p>It expires in 10 minutes.</p>`
  });
  return true;
}

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) {
    mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return mismatch === 0;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...jsonHeaders, ...corsHeaders() }
  });
}

function corsHeaders(): HeadersInit {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "authorization,content-type,idempotency-key,x-alif-signup-secret"
  };
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}
