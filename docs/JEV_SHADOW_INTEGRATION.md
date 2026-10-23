# Jev decision control plane

**Status: experimental, disabled by default.** No automatic dispatch of selected tools or models. Existing production routes remain unchanged.

Required server-only environment variables: `TYPESAFE_API_KEY`, `JEV_SHADOW_ENABLED=true`. Optional: `JEV_MODEL=jev-latest`.

## Endpoints

- `POST /api/llm/decisions/shadow`: original choice-only shadow evaluator.
- `POST /api/llm/decisions/control`: typed decision operations. Requires an authenticated user, per-user request rate limit, explicit feature enablement.

Six capabilities:

1. **Model routing:** `{"operation":"route","input":{"task":"Explain a TypeScript error","candidates":[{"provider":"openai","model":"gpt-4o"},{"provider":"anthropic","model":"claude-3-5-sonnet-20241022"}]}}`. Returns a recommended eligible model, confidence and estimated price, but does not execute it.
2. **Agent actions:** `{"operation":"agent","input":{"state":"An API returned a transient error","actions":[{"id":"retry","description":"Retry after delay"},{"id":"stop","description":"Stop processing"}]}}`. Returns a typed proposal and policy evaluation. Execution and authorization remain external.
3. **Context selection:** `{"operation":"context","input":{"goal":"Debug parser","items":[{"id":"1","text":"Original exact error"},{"id":"2","text":"Unrelated notes"}]}}`. Retains original text verbatim within a bounded character budget. **Never use it as sole source of truth:** omitted items may matter; original input must remain available.
4. **Confidence policy:** versioned `jev-policy-v1` thresholds (`routing=0.90`, `agent=0.97`, `context=0.85`). These are conservative *initial configuration*, **not** experimentally calibrated thresholds. A passing confidence score is not equivalent to authorization.
5. **Outcomes and calibration:** `{"operation":"outcome","input":{"decisionId":"<valid UUID>","correct":true}}`, followed by `{"operation":"metrics"}`. Records explicitly supplied labels for owned decisions within 90 days; reports count, accuracy, Brier score, and **aggregate** calibration gap (not bucketed ECE). Outcomes are unverified labels, not autonomous ground truth. Concurrent duplicate-label writes are not fully serialized.
6. **Cost-aware selection:** model-specific stored USD token-price estimates, with model-provider eligibility checks and optional `maxEstimatedCostUsd`. Price is an estimate, **not live verified pricing**. Unknown model-level rates cannot satisfy a hard price cap.

## Safety and scope

Every operation requires user authentication and opt-in feature configuration. APIs do not dispatch agents or selected models. Jev requests go only to the fixed TypeSafe API host, with bounded payloads and timeouts. Do not submit private secrets or untrusted high-impact actions for automated processing. Tracking uses existing authenticated analytics events, without storing raw prompts or original context.

## Validation still required

- GitHub CI, unit tests, TypeScript, lint and build.
- Live TypeSafe API contract verification against a valid credential.
- Evaluation of actual decision quality, price and latency on labeled data.
- A transactional outcome store and stronger outcome provenance before deploying calibrated policies.
- Integration into existing execution orchestration only after opt-in and verified acceptance tests.
