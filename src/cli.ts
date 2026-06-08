#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

type Config = {
  apiUrl?: string;
  email?: string;
  sessionToken?: string;
  sessionExpiresAt?: string;
  token?: string;
  companyId?: string;
  applicationId?: string;
};

type ApiError = {
  error?: string;
  message?: string;
};

const defaultApiUrl = "https://alif-api.imuthuvappa.workers.dev";
const configPath = join(homedir(), ".alif", "config.json");

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);

  if (!command || command === "help" || command === "--help") {
    printHelp();
    return;
  }

  if (command === "apply") {
    await apply(args);
    return;
  }

  if (command === "login") {
    await login(args);
    return;
  }

  if (command === "status") {
    await status(args);
    return;
  }

  if (command === "metric") {
    await metric(args);
    return;
  }

  if (command === "whoami") {
    await whoami();
    return;
  }

  if (command === "setup-agent") {
    await setupAgent(args);
    return;
  }

  throw new CliError(`Unknown command: ${command}`);
}

async function apply(args: string[]): Promise<void> {
  const flags = parseFlags(args);
  const existing = await loadConfig();
  const rl = createInterface({ input, output });

  const apiUrl = flags["api-url"] ?? process.env.ALIF_API_URL ?? existing.apiUrl ?? defaultApiUrl;
  const founderEmail = (flags["founder-email"] ?? existing.email ?? await ask(rl, "Founder email")).toLowerCase();
  const sessionConfig = await ensureSession({ apiUrl, email: founderEmail, flags, existing, rl });
  const companyName = flags["company"] ?? await ask(rl, "Company name");
  const website = flags.website ?? await ask(rl, "Website", "");
  const founderName = flags["founder-name"] ?? await ask(rl, "Founder name");
  const oneLiner = flags["one-liner"] ?? await ask(rl, "One-liner");
  const metricKey = flags["metric-key"] ?? await ask(rl, "Primary metric key", "weekly_revenue");
  const metricCommandKey = slug(metricKey);
  const metricUnit = flags["metric-unit"] ?? await ask(rl, "Primary metric unit", "usd");
  rl.close();

  const signupSecret = flags["signup-secret"] ?? process.env.ALIF_SIGNUP_SECRET;
  const sessionToken = flags["session-token"] ?? process.env.ALIF_SESSION_TOKEN ?? sessionConfig.sessionToken;
  const response = await api(apiUrl, "/v1/applications", {
    method: "POST",
    token: sessionToken,
    headers: signupSecret ? { "x-alif-signup-secret": signupSecret } : undefined,
    body: {
      company_name: companyName,
      website: website || undefined,
      founder_name: founderName,
      founder_email: founderEmail,
      narrative: { one_liner: oneLiner },
      primary_metric: {
        key: metricKey,
        display_name: titleize(metricKey),
        unit: metricUnit,
        cadence: "weekly",
        direction: "up"
      }
    }
  });

  const nextConfig: Config = {
    ...sessionConfig,
    apiUrl,
    email: founderEmail,
    token: response.token,
    companyId: response.company_id,
    applicationId: response.application_id
  };
  await saveConfig(nextConfig);

  console.log("");
  console.log("Application submitted.");
  console.log(`Application: ${response.application_id}`);
  console.log(`Company: ${response.company_id}`);
  console.log(`Primary metric: ${metricCommandKey}`);
  console.log("");
  console.log("Update traction:");
  console.log(`  npx alif-fund metric update ${metricCommandKey} 12000`);
  console.log("");
  console.log("For agents/CI:");
  console.log(`  export ALIF_API_TOKEN=${response.token}`);
  console.log(`  npx alif-fund metric update ${metricCommandKey} 12000 --source <agent-name>`);
  console.log("");
  console.log(`Credentials saved to ${configPath}`);
}

async function login(args: string[]): Promise<void> {
  const flags = parseFlags(args);
  const existing = await loadConfig();
  const rl = createInterface({ input, output });

  const apiUrl = flags["api-url"] ?? process.env.ALIF_API_URL ?? existing.apiUrl ?? defaultApiUrl;
  const email = (flags.email ?? existing.email ?? await ask(rl, "Email")).toLowerCase();
  const nextConfig = await runEmailOtp({ apiUrl, email, flags, existing, rl });
  rl.close();

  await saveConfig(nextConfig);

  console.log(`Logged in as ${email}`);
  console.log(`Session saved to ${configPath}`);
}

async function status(args: string[]): Promise<void> {
  const flags = parseFlags(args);
  const config = await requireConfig(flags);
  const response = await api(config.apiUrl, "/v1/status", {
    method: "GET",
    token: config.token
  });

  console.log(`${response.application.company_name} (${response.application.status})`);
  console.log(`Application: ${response.application.id}`);
  console.log("");

  if (response.metrics.length === 0) {
    console.log("No metrics yet.");
  } else {
    for (const metric of response.metrics) {
      const latest = metric.latest_value === null || metric.latest_value === undefined
        ? "no points"
        : `${metric.latest_value} ${metric.unit} at ${metric.latest_timestamp}`;
      console.log(`${metric.key}: ${latest}`);
    }
  }

  if (response.alerts.length > 0) {
    console.log("");
    console.log("Recent alerts:");
    for (const alert of response.alerts) {
      console.log(`[${alert.severity}] ${alert.summary}`);
    }
  }
}

async function metric(args: string[]): Promise<void> {
  const [subcommand, ...rest] = args;
  if (subcommand === "create") {
    await createMetric(rest);
    return;
  }
  if (subcommand === "update") {
    await updateMetric(rest);
    return;
  }
  throw new CliError("Expected `alif metric create` or `alif metric update`.");
}

async function createMetric(args: string[]): Promise<void> {
  const flags = parseFlags(args);
  const key = flags._[0] ?? flags.key;
  if (!key) throw new CliError("Metric key is required.");

  const config = await requireConfig(flags);
  const response = await api(config.apiUrl, "/v1/metrics", {
    method: "POST",
    token: config.token,
    body: {
      key,
      display_name: flags.name ?? titleize(key),
      unit: flags.unit ?? "count",
      cadence: flags.cadence ?? "weekly",
      direction: flags.direction ?? "up",
      source_type: flags.source ?? "self_reported"
    }
  });

  console.log(`Metric created: ${response.key} (${response.id})`);
}

async function updateMetric(args: string[]): Promise<void> {
  const flags = parseFlags(args);
  const key = flags._[0] ?? flags.key;
  const rawValue = flags.value ?? flags._[1];
  if (!key) throw new CliError("Metric key is required.");
  if (!rawValue) throw new CliError("Metric value is required.");

  const value = Number(rawValue);
  if (!Number.isFinite(value)) throw new CliError("Metric value must be a number.");

  const config = await requireConfig(flags);
  const timestamp = flags.timestamp ?? new Date().toISOString();
  const idempotencyKey = flags["idempotency-key"] ?? `${config.companyId ?? "company"}:${key}:${timestamp}`;

  const response = await api(config.apiUrl, `/v1/metrics/${encodeURIComponent(key)}/points`, {
    method: "POST",
    token: config.token,
    idempotencyKey,
    body: {
      value,
      timestamp,
      source: flags.source ?? "alif-cli",
      confidence: flags.confidence ? Number(flags.confidence) : undefined,
      raw_event_id: flags["raw-event-id"],
      idempotency_key: idempotencyKey
    }
  });

  console.log(response.duplicate ? `Duplicate ignored: ${response.id}` : `Metric point created: ${response.id}`);
}

async function whoami(): Promise<void> {
  const config = await loadConfig();
  console.log(`API URL: ${config.apiUrl ?? "not configured"}`);
  console.log(`Email: ${config.email ?? "not configured"}`);
  console.log(`Session: ${config.sessionToken ? `configured until ${config.sessionExpiresAt ?? "unknown"}` : "not configured"}`);
  console.log(`Company: ${config.companyId ?? "not configured"}`);
  console.log(`Application: ${config.applicationId ?? "not configured"}`);
  console.log(`Agent token: ${config.token ? "configured" : "not configured"}`);
}

async function setupAgent(args: string[]): Promise<void> {
  const flags = parseFlags(args);
  const config = await loadConfig();
  const apiUrl = flags["api-url"] ?? process.env.ALIF_API_URL ?? config.apiUrl ?? defaultApiUrl;
  const token = flags.token ?? process.env.ALIF_API_TOKEN ?? config.token;
  const metric = flags.metric ?? flags._[0] ?? "weekly_revenue";

  if (!token) {
    throw new CliError("Missing agent token. Run `npx alif-fund apply` first, or pass --token / ALIF_API_TOKEN.");
  }

  console.log(`Agent setup

Use this command from Codex, Claude Code, Hermes, CI, or cron:

ALIF_API_URL=${apiUrl} \\
ALIF_API_TOKEN=${token} \\
npx alif-fund metric update ${metric} <value> \\
  --timestamp <period_end_iso> \\
  --idempotency-key <company>-${metric}-<period> \\
  --source <agent-name>

Suggested agent instruction:

Calculate ${metric} from the source of truth for the reporting period. Then run the command above with a stable idempotency key for that period. If the command fails transiently, retry with the same idempotency key.
`);
}

async function api(
  apiUrl: string | undefined,
  path: string,
  options: {
    method: "GET" | "POST";
    token?: string;
    idempotencyKey?: string;
    headers?: Record<string, string>;
    body?: Record<string, unknown>;
  }
): Promise<any> {
  if (!apiUrl) throw new CliError("Missing API URL. Run `alif apply --api-url <url>` first.");

  const headers: Record<string, string> = {
    accept: "application/json",
    ...options.headers
  };
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  if (options.idempotencyKey) headers["idempotency-key"] = options.idempotencyKey;
  if (options.body) headers["content-type"] = "application/json";

  const response = await fetch(new URL(path, apiUrl), {
    method: options.method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const payload = await response.json().catch(() => ({})) as ApiError & Record<string, any>;

  if (!response.ok) {
    throw new CliError(payload.message ?? payload.error ?? `HTTP ${response.status}`);
  }

  return payload;
}

async function requireConfig(flags: ParsedFlags): Promise<Required<Pick<Config, "apiUrl" | "token">> & Config> {
  const config = await loadConfig();
  const apiUrl = flags["api-url"] ?? process.env.ALIF_API_URL ?? config.apiUrl ?? defaultApiUrl;
  const token = flags.token ?? process.env.ALIF_API_TOKEN ?? config.token;
  if (!token) throw new CliError("Missing token. Pass --token, set ALIF_API_TOKEN, or run `alif apply`.");
  return { ...config, apiUrl, token };
}

async function ensureSession(input: {
  apiUrl: string;
  email: string;
  flags: ParsedFlags;
  existing: Config;
  rl: ReturnType<typeof createInterface>;
}): Promise<Config> {
  const explicit = input.flags["session-token"] ?? process.env.ALIF_SESSION_TOKEN;
  if (explicit) {
    return {
      ...input.existing,
      apiUrl: input.apiUrl,
      email: input.email,
      sessionToken: explicit
    };
  }

  const existingSessionMatches = input.existing.sessionToken
    && input.existing.email === input.email
    && (!input.existing.sessionExpiresAt || Date.parse(input.existing.sessionExpiresAt) > Date.now() + 60_000);

  if (existingSessionMatches) {
    return { ...input.existing, apiUrl: input.apiUrl, email: input.email };
  }

  console.log(`Sending login code to ${input.email}`);
  return runEmailOtp(input);
}

async function runEmailOtp(input: {
  apiUrl: string;
  email: string;
  flags: ParsedFlags;
  existing: Config;
  rl: ReturnType<typeof createInterface>;
}): Promise<Config> {
  const start = await api(input.apiUrl, "/v1/auth/otp/start", {
    method: "POST",
    body: { email: input.email }
  });

  if (start.dev_otp) {
    console.log(`Development OTP: ${start.dev_otp}`);
  } else {
    console.log(`Sent login code to ${input.email}`);
  }

  const code = input.flags.code ?? await ask(input.rl, "OTP code");
  const verified = await api(input.apiUrl, "/v1/auth/otp/verify", {
    method: "POST",
    body: { email: input.email, code }
  });

  return {
    ...input.existing,
    apiUrl: input.apiUrl,
    email: input.email,
    sessionToken: verified.session_token,
    sessionExpiresAt: verified.expires_at
  };
}

async function loadConfig(): Promise<Config> {
  try {
    return JSON.parse(await readFile(configPath, "utf8")) as Config;
  } catch {
    return {};
  }
}

async function saveConfig(config: Config): Promise<void> {
  await mkdir(dirname(configPath), { recursive: true, mode: 0o700 });
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}

async function ask(rl: ReturnType<typeof createInterface>, label: string, fallback?: string): Promise<string> {
  const suffix = fallback !== undefined ? ` [${fallback}]` : "";
  const answer = (await rl.question(`${label}${suffix}: `)).trim();
  if (answer) return answer;
  if (fallback !== undefined) return fallback;
  return ask(rl, label, fallback);
}

type ParsedFlags = { _: string[]; [key: string]: any };

function parseFlags(args: string[]): ParsedFlags {
  const flags: ParsedFlags = { _: [] };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const [name, inlineValue] = arg.slice(2).split("=", 2);
      const next = args[i + 1];
      if (inlineValue !== undefined) {
        flags[name] = inlineValue;
      } else if (next && !next.startsWith("--")) {
        flags[name] = next;
        i += 1;
      } else {
        flags[name] = "true";
      }
    } else {
      flags._.push(arg);
    }
  }
  return flags;
}

function titleize(value: string): string {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function slug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function printHelp(): void {
  console.log(`alif-fund

Usage:
  alif-fund apply
  alif-fund login [--email founder@example.com]
  alif-fund status
  alif-fund whoami
  alif-fund setup-agent [metric_key]
  alif-fund metric create <key> [--unit count] [--cadence weekly]
  alif-fund metric update <key> <value> [--timestamp ISO_DATE] [--source agent]

Automation:
  ALIF_API_TOKEN=alif_live_... \\
    alif-fund metric update weekly_revenue 12000
`);
}

class CliError extends Error {}

main().catch((error) => {
  console.error(error instanceof CliError ? error.message : error);
  process.exitCode = 1;
});
