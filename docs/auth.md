# Auth Model

Alif uses two different token types.

## Human Session Token

Email OTP login returns:

```text
alif_session_<public_id>_<secret>
```

This token proves founder email ownership. Application creation can require this session when the Worker is configured with:

```text
REQUIRE_EMAIL_OTP=true
```

OTP challenges:

- are 6 digits
- expire after 10 minutes
- are stored hashed
- allow a limited number of verification attempts

## Agent Automation Token

Application creation returns:

```text
alif_live_<public_id>_<secret>
```

This token is for agents, cron jobs, CI, and scripts.

Current scopes:

```text
application:read
metrics:create
metrics:write
```

Agents should receive this token through `ALIF_API_TOKEN`, not through committed config files.

## Why Two Tokens?

The founder session is identity. The agent token is delegation.

That means a founder can eventually revoke or rotate automation credentials without changing their login identity.
