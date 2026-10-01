# Mint Motive API

The VERTEX engine and tool tracer as an API, with everything around it: the developer portal, docs, console (keys, call log, webhooks, plans), status page and the staff admin. Live at **https://api.mintmotive.com.au**.

It runs on its own: its own server, database, sessions and Stripe webhook. Accounts stay on VERTEX. People sign in with their VERTEX account (password, Google, Discord, two-factor), and the API site never sees a password.

## How it fits with VERTEX

| | |
|---|---|
| Sign in | `/signin` → `/auth/vertex` → VERTEX `/api-link/authorize` → back to `/auth/vertex/callback` with a one-time code, swapped over the link |
| Accounts | `users` here is a small copy (id, email, name, handle, role), kept fresh from VERTEX every 15 minutes. Banned there means signed out here, with keys stopped; deleted there means deleted here. |
| Alerts | The guard's alerts go to VERTEX staff (bell, email, Discord) and link back to `/admin#alerts` |
| Switches | Engine API on/off and the tracer API live here (Admin → Settings). Generator pauses, size limits and the staff two-factor rule come from VERTEX. |
| Engine | `engine/` is a copy of VERTEX's engine. Refresh it after engine changes with `npm run sync-engine -- ../gridfinity-generator`. |
| First boot | The API's old records (keys, call log, plans, webhooks, incidents) are pulled from VERTEX once |

## Pages and paths

`/` portal · `/docs` · `/status` · `/console` · `/admin` · `/signin`. The APIs are `/engine/v1/…` and `/trace/v1/…`, also answered under `/api/…`. Old `/api-portal/…` links redirect.

## Environment (Railway → this service → Variables)

| Variable | |
|---|---|
| `PUBLIC_URL` | `https://api.mintmotive.com.au` |
| `VERTEX_URL` | `https://vertex.mintmotive.com.au` |
| `API_LINK_SECRET` | Long random string; the **same** value on the VERTEX service |
| `DATABASE_PATH` | On the volume, e.g. `/data/api.db` |
| `DATABASE_URL` | This service's own PostgreSQL (a full copy of the database, restored onto an empty volume) |
| `TRUST_PROXY` | `1` on Railway |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Same Stripe account. The webhook is its own endpoint: `https://api.mintmotive.com.au/api/stripe/webhook`, with `checkout.session.completed` and `customer.subscription.*` |
| Tracer | The same tracer variables as VERTEX (see VERTEX's private docs) |

On VERTEX, set `API_PUBLIC_URL=https://api.mintmotive.com.au` and the same `API_LINK_SECRET`. VERTEX's own copy of the API then goes quiet and forwards there.

## Running and testing

```
npm start          # node 22.13+, no dependencies
npm test
```
