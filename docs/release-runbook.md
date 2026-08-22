# Release runbook

The order, and the reason for each edge. The README's **Deploy** section carries the *what* of
every variable — what `WEB_ORIGIN` and `SITE_URL` mean, and why each is a secret. This file
carries the *when*, which is the part that bites: every step below is safe on its own and three
of the four orderings produce a broken production.

Written during the `bingo.twinion.net` release (#89, 2026-08-21), so the commands are the ones
that were actually run, gotchas included.

## The order

| Step | Why it comes before the next one |
| --- | --- |
| 1. DNS + domain | Slowest to propagate and blocks nothing else, so start it first. Vercel issues the certificate on its own once the CNAME resolves |
| 2. Migration | `0004` adds an enum value the new API writes. Deploy the API first and re-roll 500s in production for as long as the gap lasts |
| 3. API deploy | The browser calling an API that does not yet allow its origin is a CORS failure on the first join, not a degraded page |
| 4. `SITE_URL` + web deploy | `siteOrigin()` reads the variable per request, but the domain has to exist for the value to be reachable |

## 1. DNS and the domain

The zone is on Cloudflare, the app is on Vercel, and the record is a **grey cloud**. Proxying puts
Cloudflare's certificate in front of Vercel's, which breaks Vercel's domain verification and leaves
TLS owned by neither side cleanly. `api.twinion.net` is already set up this way.

```bash
CF=$(op read op://dev/twinion-bingo-cloudflare/api_token)
ZONE=$(curl -s -H "Authorization: Bearer $CF" \
  "https://api.cloudflare.com/client/v4/zones?name=twinion.net" | jq -r '.result[0].id')
curl -s -X POST -H "Authorization: Bearer $CF" -H 'content-type: application/json' \
  "https://api.cloudflare.com/client/v4/zones/$ZONE/dns_records" \
  -d '{"type":"CNAME","name":"bingo","content":"cname.vercel-dns.com","proxied":false,"ttl":1}'

npx vercel@latest domains add bingo.twinion.net twinion-bingo-web
```

The Cloudflare token needs `Zone:DNS:Edit` on `twinion.net` only — never the Global API Key. It is
an account-scoped token, so `GET /user/tokens/verify` answers `Invalid API Token` even when the
token works fine; test it against the zone endpoint instead.

`vercel link` and every `vercel` command run from the **repo root**, not `apps/web`. The project's
Root Directory is already `apps/web` and resolves relative to the link, so linking inside `apps/web`
sends it looking for `apps/web/apps/web`.

## 2. Migration

Read the SQL before running it, per the README's standing rule. Re-running the chain is a proven
no-op — CI's `db` job applies it twice against a service container.

```bash
DATABASE_URL=$(op read op://dev/twinion-postgres/pooler_connection_string) \
  pnpm --filter @twinion-bingo/api db:migrate
```

**Use the pooler field, not `connection_string`.** Supabase's direct host
(`db.<ref>.supabase.co`) is IPv6-only — it publishes an AAAA record and no A record — so a laptop on
a typical IPv4 home network gets `EHOSTUNREACH` on port 5432 and the migration dies on its first
statement. This reads as "the migration is broken" and is not. The session pooler
(`aws-1-us-west-2.pooler.supabase.com:5432`, user `postgres.<ref>`) is reachable over IPv4.

Port 5432, not 6543: transaction mode does not support the `ALTER TYPE ... ADD VALUE` this chain
contains. Note the host prefix is `aws-1-`, not the `aws-0-` most documentation still shows.

Verify the migration rather than trusting the "migrations applied" line — it reports the journal,
not the schema:

```sql
select enumlabel from pg_enum e
  join pg_type t on t.oid = e.enumtypid
  join pg_namespace n on n.oid = t.typnamespace
 where n.nspname = 'bingo' and t.typname = 'room_event_kind';
```

## 3. API

Both origins, in one `fly secrets set` so there is one restart rather than two:

```bash
fly secrets set \
  WEB_ORIGIN='https://bingo.twinion.net,https://twinion-bingo-web.vercel.app' \
  DATABASE_URL="$(op read op://dev/twinion-postgres/pooler_connection_string)" \
  -a twinion-bingo-api

fly deploy . --config apps/api/fly.toml
```

Both entries, not one. `vercelPreviewPattern` (`apps/api/src/config.ts`) derives the preview regex
from the `*.vercel.app` entry and has nothing to derive it from otherwise, so dropping it silently
kills every preview deployment's API access.

`fly secrets list` prints digests, never values. To read what `WEB_ORIGIN` is actually set to, read
the boot line instead — `fly logs -a twinion-bingo-api | grep 'api listening'` prints the origins
the process parsed, which is the value that matters:

```
api listening on :8080, web origins https://bingo.twinion.net, https://twinion-bingo-web.vercel.app
```

## 4. Web

```bash
printf 'https://bingo.twinion.net' | npx vercel@latest env add SITE_URL production
npx vercel@latest env ls        # assert SITE_URL is Production ONLY
npx vercel@latest deploy --prod
```

Be pedantic about that assertion. `siteOrigin()` is written so the request host is the default and
`SITE_URL` is the exception; a `SITE_URL` that leaks into Preview makes every preview's share link
and QR point at production, which is the bug the module exists to remove.

## Production verification

Scriptable, straight against the live origin. `<CODE>` is any live room:

```bash
curl -sI https://bingo.twinion.net                       # 200, certificate is Vercel's
curl -s  https://bingo.twinion.net/r/<CODE> | grep -i 'rel="canonical"\|og:url'
curl -sI https://bingo.twinion.net/r/<CODE>/opengraph-image   # image/png

# CORS, both directions
curl -si -X OPTIONS https://twinion-bingo-api.fly.dev/rooms \
  -H 'Origin: https://bingo.twinion.net' -H 'Access-Control-Request-Method: POST' \
  | grep -i 'access-control-allow-origin'
curl -si -X OPTIONS https://twinion-bingo-api.fly.dev/rooms \
  -H 'Origin: https://evil.example.com' -H 'Access-Control-Request-Method: POST' \
  | grep -i 'access-control-allow-origin'   # must print nothing

pnpm sim --base-url https://twinion-bingo-api.fly.dev --sweep
```

The negative control that proves `SITE_URL` did not leak is a preview deployment's own canonical
tag. Previews sit behind Deployment Protection, so a plain `curl` gets a 302 to SSO and looks like a
failure — use `vercel curl`, which carries the bypass:

```bash
npx vercel@latest curl "$(npx vercel@latest deploy)/r/<CODE>" | grep -i 'rel="canonical"'
```

Operator-only, on real hardware, and the reason a release cannot be closed by a script:

- Scan the QR in the share dialog with a phone camera — it must open the room on the real domain.
- Paste a share link into a group chat and read the unfurl.
- Tap re-roll in a live game. This is the direct test that the migration landed, and the one failure
  mode the ordering above exists to prevent.

## Rollback

- **API** — `fly releases -a twinion-bingo-api`, then `fly deploy --image <previous>` . A missing or
  empty `WEB_ORIGIN`/`DATABASE_URL` is not a degraded API: it throws before it listens, so the deploy
  fails its health check and Fly rolls back on its own.
- **Web** — Vercel's instant rollback, or `vercel rollback`.
- **Migration** — none exists and none is needed. `0004` is additive: one enum value, one nullable
  column. An older API ignores both.

## Release log

**2026-08-21 — `bingo.twinion.net` (#89).** First real deploy of the API; production had been
serving the July 2026 skeleton, which is why `/health` answered 200 the whole time and proved
nothing. `DATABASE_URL` had never been set on `twinion-bingo-api` at all. Fly points at the Supabase
session pooler rather than the direct host, so the same connection string works from a laptop and
from Fly. Verification: 132/132 on `pnpm sim --sweep`, canonical and `og:url` both naming the new
origin, preview canonical naming its own host, and the three device checks passed on real hardware.
