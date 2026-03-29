# Reliability SLOs

This document locks Step 8 of the ordered plan.

Scope:
- define the runtime reliability targets that matter for this product now
- define the alertability contract from `/api/health`
- define the repeatable local verification used before promotion

This is not an uptime marketing page. It is the operator-facing reliability
contract for the current product stage.

## 1. Service Level Objectives

### Core availability
- SLI:
  - `GET /api/health` returns `200`
  - payload `status` is either `healthy` or `degraded`
  - payload `summary.coreAvailability` is `available` for full core health
- Target:
  - `99.5%` successful health responses per rolling 30-day window

### Health latency
- SLI:
  - p95 response time for `/api/health`
- Target:
  - `<= 750ms` under the local reliability harness default load:
    - `30` requests
    - concurrency `6`

### Degraded dependency handling
- SLI:
  - optional dependency failures do not crash the app
  - `/api/health` and `/api/admin/status` report degraded state truthfully
- Target:
  - `100%` of tested degraded cases must degrade cleanly instead of failing with
    unhandled `5xx`

### Release gate
- SLI:
  - the Step 8 reliability harness passes on the candidate branch
- Target:
  - `100%` pass required before Step 8 can be considered complete

## 2. Alertability Contract

Monitoring should consume `/api/health`.
Detailed diagnostics should come from `/api/admin/status` or authenticated admin
health access, not the public health payload.

Machine-readable summary fields:
- `summary.coreAvailability`
- `summary.degradedChecks`
- `summary.alertLevel`
- `summary.shouldPage`

Alert policy:
- `alertLevel=critical`
  - page immediately
  - currently maps to database degradation because core persistence is impaired
- `alertLevel=warning`
  - create an operator action item if the state persists
  - currently maps to optional dependency degradation:
    - cache
    - rate limiting
    - sidecar
- `alertLevel=none`
  - no reliability action required

## 3. Required Failure Scenarios

The following must stay verified:
- database unavailable:
  - health becomes `degraded`
  - admin status becomes `warning`
  - message explains in-memory fallback when applicable
  - `summary.alertLevel=critical`
- Redis configured but unavailable:
  - cache and rate-limit paths degrade cleanly
  - no route-load crash
  - `summary.alertLevel=warning`
- sidecar unavailable:
  - app remains operable
  - health/admin mark sidecar degraded
  - `summary.alertLevel=warning`

## 4. Repeatable Verification

Use:

```bash
bash scripts/reliability-check.sh --base-url http://localhost:3000 --start-server
```

What it does:
- runs the degraded-dependency test slice:
  - `test/api-health-route.test.ts`
  - `test/api-admin-status-route.test.ts`
  - `test/cache.test.ts`
  - `test/rate-limit.test.ts`
- builds and starts the app when `--start-server` is used
- runs a bounded concurrency probe against:
  - `/api/health`
  - `/api/health?metrics=1`
- checks:
  - `200` responses only
  - valid health payloads
  - p95 latency within threshold
  - no unexpected page condition on the healthy baseline

## 5. What Step 8 Does Not Claim

Step 8 does not claim:
- internet-scale load proof
- regional failover
- autoscaling guarantees
- synthetic uptime monitoring outside this repo

It proves the current application has:
- explicit reliability targets
- machine-readable alerting semantics
- repeatable degraded-path verification
- repeatable bounded-load verification
