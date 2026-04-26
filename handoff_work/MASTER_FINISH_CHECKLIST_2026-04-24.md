# Master Finish Checklist (2026-04-24)

This checklist is execution-focused and evidence-first.
It is intended to move the repository from strong technical readiness to
finished product readiness without scope creep.

## How To Use This Checklist
- Do work in ordered phases only.
- Do not mark any item done without a command output, log excerpt, or linked
  artifact.
- Keep every claim aligned to current code behavior.

---

## Phase 0 — Runtime Truth Lock (Required Before Feature Work)

### 0.1 Baseline verification
- [ ] `git status --short` is clean.
- [ ] `npm run type-check` passes.
- [ ] `npm run lint` passes.
- [ ] `npm run test:run` passes.
- [ ] `npm run build` passes with production-required env vars set.

Evidence:
- [ ] command logs attached.
- [ ] failing logs triaged into explicit blockers if any command fails.

### 0.2 Environment readiness
- [ ] validate non-secret env inventory vs `.env.example`.
- [ ] verify production-required envs are configured:
  - `DATABASE_URL`
  - `NEXTAUTH_SECRET` or `AUTH_SECRET`
  - `NEXTAUTH_URL`
  - `API_KEY_ENCRYPTION_SEED`

Evidence:
- [ ] env audit artifact with variable presence only (no secret values).

---

## Phase 1 — Step 10 Monetization Completion

### 1.1 Billing UX and behavior
- [ ] `/billing` shows current plan + next action without ambiguity.
- [ ] FREE users can start checkout path.
- [ ] PRO users can open billing portal path.
- [ ] upgrade recommendation appears when WSBC threshold is reached.

### 1.2 Billing telemetry completeness
- [ ] `billing_viewed` recorded for billing page views.
- [ ] `billing_checkout_session_created` recorded for checkout starts.
- [ ] `billing_portal_session_created` recorded for portal starts.
- [ ] analytics surface exposes all three metrics and values update from real events.

### 1.3 Step 10 acceptance proof
- [ ] at least one full FREE -> checkout attempt trace captured.
- [ ] at least one PRO -> portal attempt trace captured.
- [ ] weekly report links WSBC distribution to billing intent events.

Evidence:
- [ ] endpoint logs and analytics payload snapshots.
- [ ] screenshots or recordings of billing path states.

---

## Phase 2 — Step 11 First Real Users (Founder-Led Outbound Only)

### 2.1 Prospect pipeline
- [ ] first batch of 10 ICP-fit prospects documented.
- [ ] outreach messages sent with consistent attribution tags.
- [ ] response statuses tracked.

### 2.2 Demo and onboarding execution
- [ ] at least 3 demos completed in first batch.
- [ ] onboarding outcomes captured for each demo user.
- [ ] friction points and objections logged immediately after calls.

### 2.3 Product usage proof
- [ ] at least 10 real users onboarded or meaningfully tested.
- [ ] at least 3 complete core workflow attempt.
- [ ] top 5 objections ranked.
- [ ] top 5 frictions ranked.

### 2.4 Attribution telemetry proof
- [ ] founder-outbound attributed events visible in analytics.
- [ ] active cohorts are visible and non-zero.
- [ ] comparison-ready saves attributed to founder-outbound are visible.

Evidence:
- [ ] outreach ledger.
- [ ] onboarding notes with anonymized IDs.
- [ ] analytics snapshots for founder-outbound metrics.

---

## Phase 3 — Step 12 Retention Proof

### 3.1 Repeat usage
- [ ] define retention cohort window (weekly).
- [ ] compute repeat core-workflow runs for real users.
- [ ] summarize why users returned or churned.

### 3.2 Retention acceptance
- [ ] documented repeat behavior exists beyond first-run novelty.
- [ ] explicit retention blockers prioritized by impact.

Evidence:
- [ ] retention cohort table.
- [ ] user interview or support-note summaries.

---

## Phase 4 — Reliability / Security / Operations Sustainment

### 4.1 Reliability
- [ ] run reliability checks under degraded dependencies.
- [ ] verify `/api/health` alert fields stay truthful.

### 4.2 Security
- [ ] secrets rotation drill re-run.
- [ ] backup + restore drill re-run.
- [ ] threat model updates if architecture changed.

Evidence:
- [ ] operator runbook execution notes and logs.

---

## Phase 5 — Buyer-Ready Package

### 5.1 Narrative and diligence package
- [ ] concise product story for ICP + use case.
- [ ] architecture and operational evidence index updated.
- [ ] residual risks and mitigations updated.

### 5.2 Commercial proof
- [ ] real paid or pilot evidence collected.
- [ ] unit economics and pricing behavior reviewed against real usage.

Evidence:
- [ ] diligence packet with links to proof artifacts.

---

## Strict Done Definition (Finished Product Candidate)
A “finished” claim requires all of the following:
- [ ] Step 10 completed with real billing behavior proof.
- [ ] Step 11 completed with real-user workflow proof.
- [ ] Step 12 completed with repeat-usage proof.
- [ ] Reliability/security runbooks re-verified on current head.
- [ ] Diligence package updated and internally consistent.

If any checkbox above is unchecked, status remains “in progress”.
