# Production deploy steps — 2.6.1 (audit-remediation post-fix)

This release includes:
- `getNow()` math refactor (removed double timezone shift)
- `JWT_SECRET` / `JWT_REFRESH_SECRET` synced between `.env` and `.env.production`
- `Dockerfile` adds `busybox-extras` (sntp client) for NTP fallback in container
- Removes untracked `backend/test-push.ts` debug script
- Adds 4 vitest cases locking the Fake-UTC wall-clock invariant

**Run these on the production host, in order:**

## 1. Pull + rebuild

```bash
cd /opt/catering  # or wherever the repo lives
git pull origin main
docker compose build --no-cache backend   # forces new Dockerfile (busybox-extras + ts recompile)
docker compose up -d --force-recreate backend
```

`--force-recreate` is required because `volumes:` in `docker-compose.yml` mount `./backend/src` directly — without a recreate, the container keeps the old `dist/` from its image build layer.

## 2. Verify the container picked up the new env

```bash
docker exec catering-backend env | grep -E "JWT_SECRET|CORS_ORIGIN|ENABLE_TOKEN_ROTATION"
```

All three must be present. The fail-fast CORS check in `index.ts:55-58` will exit(1) on missing/wildcard `CORS_ORIGIN`, which manifests as a crashloop in `docker logs catering-backend`.

## 3. Run any pending Prisma migrations

```bash
docker exec catering-backend npx prisma migrate status
docker exec catering-backend npx prisma migrate deploy
```

The 2.6.0 release shipped 4 new migrations. If `migrate status` shows pending:
- `20260614_add_canteen_vendor_id` — F-2 vendor scoping (nullable FK)
- `20260614_add_refresh_token_rotation` — F-3 token rotation
- `20260614_add_order_userId_date_status_index` — D-4 query index
- `20260614_promote_add_cutoff_mode` / `promote_add_nik_column` / `promote_add_sunday_holiday` — previously standalone SQL promoted to Prisma

**`migrate deploy`** is non-interactive; safe in production.

## 4. Clear Redis cache

The 30-minute `settings:default` TTL on `getCachedSettings()` will eventually expire on its own, but for an immediate effect:

```bash
docker exec catering-redis redis-cli FLUSHDB
```

This forces `getCachedSettings()` to re-read from Postgres on the next request, picking up any operator changes made via the admin UI.

## 5. Force all clients to re-login

Because we changed `JWT_SECRET` last char in `.env.production` and the access tokens issued under the old secret are still 15-min-valid, you have two choices:

**Option A — wait it out (5-30 min):** Most users will hit 401, the AuthContext response interceptor will attempt refresh, refresh will fail (issuer mismatch / old secret), `force-logout` event fires, client redirects to /login. Self-healing.

**Option B — proactive flush (immediate):**
```bash
# Backend
docker exec catering-redis redis-cli FLUSHDB

# Frontend (web users): noop — they get cleared by Option A.
# Native (Android/iOS): users must clear app data or reinstall.
```

## 6. Smoke test

```bash
# Health
curl -sS https://hallofood.santosjayaabadi.co.id/api/health
# Expected: {"status":"ok","timestamp":"2026-06-14T...Z"}

# Login (admin)
curl -sS -X POST https://hallofood.santosjayaabadi.co.id/api/auth/login \
    -H 'Content-Type: application/json' \
    -d '{"externalId":"admin","password":"admin123"}' | jq

# Place an order for tomorrow
curl -sS -X POST https://hallofood.santosjayaabadi.co.id/api/orders \
    -H "Authorization: Bearer <token>" \
    -H 'Content-Type: application/json' \
    -d '{"shiftId":"<some-shift-id>","orderDate":"2026-06-15","canteenId":"<some-canteen-id>"}' | jq

# Check NTP
curl -sS https://hallofood.santosjayaabadi.co.id/api/time/ntp-servers | jq
curl -sS -X POST https://hallofood.santosjayaabadi.co.id/api/time/ntp/sync \
    -H "Authorization: Bearer <admin-token>" | jq
# Expected: {"success":true,"offset":~<ms>,"message":"NTP sync completed"}
# If offset is 0, the HTTP fallback worked but the SNTP path failed — check logs:
docker logs catering-backend --tail 200 | grep -E "NTP|sntp|ntpdate"
```

## 7. Monitor for 1 hour

```bash
# Watch for 401 spikes (token failures)
docker logs -f catering-backend 2>&1 | grep -E "401|Invalid|verify"

# Watch for CORS errors
docker logs -f catering-backend 2>&1 | grep -E "CORS|origin"

# Watch for order capacity errors
docker logs -f catering-backend 2>&1 | grep -E "CapacityError|CAPACITY_FULL"
```

## Rollback

If something goes catastrophically wrong, the previous image is still in the Docker image cache:

```bash
docker compose down backend
docker image ls catering-backend    # find previous tag
docker compose up -d backend   # edit docker-compose.yml to use previous image tag first
```

The 2.6.0 release was at git commit `36892fd`. To roll back to that exact state:
```bash
git checkout 36892fd -- backend/ .env.production
docker compose build backend
docker compose up -d --force-recreate backend
```
