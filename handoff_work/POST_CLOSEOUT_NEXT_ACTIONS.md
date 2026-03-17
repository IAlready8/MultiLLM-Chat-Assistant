# Current Locked Plan

This is the only authoritative forward plan file in `handoff_work/`.

## Operating Lock
- do not reopen release-closeout work
- do not invent new product scope
- do not change the execution order below
- do not skip steps
- do not cut scope by calling partial proof "done"
- do not treat code quality alone as product or business maturity

## Locked Decisions
### Step 2: Exact ICP And Use Case
- Exact ICP:
  - independent AI consultants and boutique agencies producing repeatable client deliverables with multiple LLM providers
- Exact use case:
  - run the same client brief through multiple providers and reusable personas, compare outputs side by side, preserve the conversation history, and use analytics/admin diagnostics to improve repeatability over time
- Why this exists instead of generic ChatGPT / Claude use:
  - the product's value is the combination of multi-provider comparison, persona reuse, saved workflow history, and operator-level diagnostics in one controlled workspace

### Step 3: Primary Value Metric
- Primary KPI:
  - Weekly Saved Brief Comparisons (`WSBC`)
- Definition:
  - the count per calendar week of qualifying saved comparison sessions
  - a qualifying session is one in which a user:
    - runs one client brief through at least two different providers
    - may use one or more reusable personas during that comparison
    - preserves the result in the application's conversation history or comparison flow
- Why this is the primary metric:
  - it measures the exact core workflow end to end instead of rewarding empty volume such as raw prompts, token count, or passive logins
- Does not count:
  - multi-persona runs on only one provider
  - single-provider ad hoc chat
  - unsaved test prompts
  - billing events without completed workflow use
- Secondary metrics stay secondary until later steps:
  - activation
  - retention
  - paid conversion
  - latency

### Step 4: Scope Cut To Core Workflow
- Highest-value path to keep prominent:
  - settings -> personas -> multi-chat/comparison -> saved conversation history -> analytics
- Primary navigation should emphasize:
  - `Multi-Chat`
  - `Comparison`
  - `Personas`
  - `Analytics`
  - `Settings`
- De-emphasize from primary navigation and home-page promotion:
  - `Goal Hub`
  - `Pipeline`
  - `AI Roundtable`
- Rule:
  - non-core surfaces may remain reachable, but they must not compete visually with the main workflow until later steps justify them

### Step 5: Onboarding And Activation
- Activation sequence to optimize:
  - configure one provider
  - create one persona
  - run and save one brief in `Multi-Chat`
  - continue into `Comparison`
  - review `Analytics` after real usage exists
- First-run UX rule:
  - home page must expose the next best activation step clearly instead of treating every surface as equally important
- Interim activation tracking rule:
  - until Step 7 telemetry work lands, derive activation progress from configured providers, saved personas, and saved conversations

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
- current gap to a genuine real-world `9/10` means the project is still below top-tier market readiness in product focus, real user proof, retention, moat, and commercial evidence
- all future work should be justified against the 16-step order above
