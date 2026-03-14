# Current Locked Plan

This is the only authoritative forward plan file in `handoff_work/`.

## Operating Lock
- do not reopen release-closeout work
- do not invent new product scope
- do not change the execution order below
- do not skip steps
- do not cut scope by calling partial proof "done"
- do not treat code quality alone as product or business maturity

## Exact Execution Order
1. freeze baseline
   - preserve `main` as the stable release line
   - keep one active roadmap branch at a time
   - keep one authoritative roadmap and acceptance surface
2. define one exact ICP and one exact use case
   - one buyer type
   - one core painful workflow
   - one clear reason this product exists instead of generic ChatGPT / Claude usage
3. define the primary value metric
   - one KPI only
   - secondary metrics may exist, but one primary metric drives product decisions
4. cut product scope to the core workflow
   - keep only the highest-value path prominent
   - de-emphasize or hide weak/non-core surfaces
5. redesign onboarding and activation
   - get valid users to first successful outcome fast
   - instrument activation drop-off
6. harden core UX
   - loading, empty, error, and recovery states
   - copy consistency
   - mobile, keyboard, and accessibility pass
7. build real analytics and decision telemetry
   - activation
   - retention
   - usage depth
   - failures tied to user impact
8. prove reliability under realistic load and degraded dependencies
   - define SLOs
   - run load and failure-path verification
   - confirm alertability and degraded behavior
9. finish security posture to buyer-grade
   - threat model
   - auth/session review
   - secrets rotation
   - backup/restore proof
   - incident response material
10. validate monetization behavior
   - pricing model
   - upgrade path
   - billing behavior tied to product use, not just Stripe wiring
11. acquire first real users in one niche channel
   - one channel only
   - onboard real users manually if needed
12. prove retention
   - repeat use
   - weekly behavior
   - reasons users come back
13. build one real moat deeply
   - one hard-to-replace advantage
   - no generic wrapper sprawl
14. package buyer diligence materials
   - product story
   - architecture
   - proof
   - transfer readiness
15. prove financial performance
   - revenue, paid pilots, or equivalent real commercial proof
16. add enterprise-specific features only if demanded by the target buyer
   - no premature enterprise theater

## What Is Out Of Scope Until The Ordered Plan Requires It
- random feature work
- broad dependency churn without a direct step in the sequence above
- UI sprawl outside the core workflow
- reopening completed release/handoff conclusions
- changing `main` casually instead of intentionally

## Current Interpretation
- current repo state is strong on engineering hygiene and operational readiness
- current gap to a genuine real-world `9/10` is primarily product focus, user proof, retention, moat, and commercial evidence
- all future work should be justified against the 16-step order above
