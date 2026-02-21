# Deploying to DigitalOcean App Platform

## Prerequisites
```bash
brew install doctl
doctl auth init   # paste your DO personal access token
```

## Step 1 — Fill in secrets in `.do/app.yaml`

Search for `REPLACE_WITH_` and substitute your real values:

| Placeholder | Where to find it |
|---|---|
| `REPLACE_WITH_DO_DB_HOST` | DO dashboard → Databases → your cluster → Connection Details |
| `REPLACE_WITH_DO_DB_PASSWORD` | Same page, password field |
| `REPLACE_WITH_DOME_API_KEY` | https://domeapi.com → Settings → API Keys |
| `REPLACE_WITH_ANTHROPIC_KEY` | https://console.anthropic.com → API Keys |

> **Security:** Never commit the filled-in `app.yaml`. Use `doctl` to push it once
> and then manage secrets via the DO dashboard.

## Step 2 — First deploy

```bash
# From repo root
doctl apps create --spec .do/app.yaml
```

DO will output your new App ID. Save it.

## Step 3 — After first deploy, lock down CORS

```bash
APP_ID=<your-app-id>
FRONTEND_URL=$(doctl apps get $APP_ID --format LiveURL --no-header)

doctl apps update $APP_ID --spec .do/app.yaml
# Or update just the backend env var:
doctl apps update $APP_ID --spec - <<EOF
...CORS_ORIGINS: ${FRONTEND_URL}
EOF
```

## Subsequent deploys (push to main branch auto-triggers if GitHub is linked)

```bash
doctl apps update $APP_ID --spec .do/app.yaml
```

## What DO App Platform does automatically

| Step | Who does it |
|---|---|
| `predictions-ingest db migrate` | **PRE_DEPLOY job** — runs before every deploy |
| Start backend (gunicorn, 2 workers) | `backend` service |
| Build + serve frontend (nginx) | `frontend` service |
| Run 5-min pipeline scheduler | `pipeline` worker |
| Restart pipeline if it crashes | DO App Platform (automatic) |
| TLS / HTTPS certificate | DO App Platform (automatic) |

## Routing (single domain, no CORS)

```
https://your-app.ondigitalocean.app/api/*  → FastAPI backend (port 8001)
https://your-app.ondigitalocean.app/*      → React frontend (port 80)
```

Both are on the same domain, so the browser sees them as same-origin.  
`VITE_API_URL=""` (empty) means all `/api/...` calls are automatically routed to the backend.

## Useful commands

```bash
# View live logs
doctl apps logs $APP_ID --component backend --follow
doctl apps logs $APP_ID --component pipeline --follow

# Check pipeline is running
doctl apps logs $APP_ID --component pipeline --tail 50

# Check data freshness (after deploy)
curl https://your-app.ondigitalocean.app/api/data-status

# Scale backend workers (no redeploy needed)
# Set WEB_CONCURRENCY=4 in backend env vars, then redeploy
```

## Instance sizes & monthly cost estimate

| Component | Size | RAM | vCPU | Cost/mo |
|---|---|---|---|---|
| frontend | basic-xs | 512 MB | 1 | ~$5 |
| backend | professional-xs | 1 GB | 1 | ~$12 |
| pipeline | basic-xs | 512 MB | 1 | ~$5 |
| db-migrate | basic-xs | 512 MB | 1 | ~$0 (job, billed per second) |
| **Total** | | | | **~$22/mo** |

> Upgrade `backend` to `professional-s` (2 GB) if you see OOM errors.
