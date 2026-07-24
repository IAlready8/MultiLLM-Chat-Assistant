# Step 11 Private Pilot Plan

## Pilot Guardrails
- Pilot type: private, founder-led, invite-only.
- Owner/login email: `dan.frydenberg@gmail.com`.
- Working product URL: `https://multi-llm-chat-assistant.vercel.app/`.
- Do not publicly launch.
- Do not activate live payments or require a paid checkout for access.
- Do not delete live deployments.
- Do not permanently delete branches.
- Keep production available for invited testers only through direct onboarding.

## Objective
Run a 10-user private pilot with the locked Step 11 ICP and prove whether real users complete the core workflow: configure a provider, create a persona, save a comparison-ready conversation, inspect comparison output, and review analytics.

## Pilot Cohort
- Cohort size: 10 real ICP users.
- Channel: founder-led direct outbound only.
- Target users: independent AI consultants and boutique agencies producing repeatable client deliverables with multiple LLM providers.
- Disqualify generic chatbot users, hobbyists, and prospects without repeatable client deliverables.

## Access Model
1. Invite prospects manually from the first 10-person outbound batch.
2. Generate one attribution-safe invite URL per cohort using `npm run pilot:invite -- --cohort <cohort>` and save it in the tracker.
3. Use the production URL only after a direct conversation, demo, or onboarding exchange.
4. Ask each participant to create or use their own account and configure their own provider key during onboarding.
5. Keep billing in validation mode: show the billing page if relevant, but do not require checkout or activate live payments for the pilot.
6. Record each participant in `docs/templates/step11-private-pilot-tracker.csv` before sending access.

### Invite Link Convention
- Use `source=founder-outbound` for every pilot link; it is set by the generator.
- Use `campaign=private-pilot` unless a deliberate, documented sub-campaign is being tested.
- Use a cohort such as `wave-1`; do not place a prospect name or email in the URL.
- The app stores this attribution for 30 days and includes it on Step 11 workflow events.

## Recommended Founder Outreach
Use this exact message for the first batch unless a prospect requires a warmer introduction:

> You look like exactly the kind of team that has to run the same client brief through more than one model and keep the best version. I built a workspace for that exact job: reusable personas, multi-provider runs, side-by-side comparison, and saved conversation history in one place. It is meant to replace the tab-hopping and copy-paste loop, not be another generic chatbot. If that is relevant, I want 15 minutes to walk you through it and watch where it helps or breaks.

## Demo Flow
1. Confirm they match the ICP and use repeatable client deliverables.
2. Open `https://multi-llm-chat-assistant.vercel.app/`.
3. Walk through `/settings` to configure at least one provider.
4. Walk through `/personas` to create one reusable delivery persona.
5. Walk through `/multi-chat` with a real or sanitized client brief.
6. Save a conversation that includes at least one provider response.
7. Open `/comparison` and inspect the saved output.
8. Open `/analytics` and explain Weekly Saved Brief Comparisons.
9. Ask whether they would use the workflow on real client work this week.
10. Record the outcome, top objection, top friction point, and next action.

## Success Criteria
The private pilot is successful only if all of the following are true:
- 10 real ICP users receive direct demo or onboarding attention.
- At least 3 complete the core workflow.
- Each completed workflow has a saved comparison-ready conversation.
- Top 5 objections are ranked.
- Top 5 friction points are ranked.
- There is a clear answer to who wants the product and why.

## Deployment Preparation
Allowed without additional approval:
- local tests and static checks;
- Git branch and PR preparation;
- Vercel preview deployment preparation;
- non-destructive production verification against the existing domain.

Show the owner before doing any of the following:
- public launch announcement;
- live payment activation or payment-required access;
- deleting live deployments;
- permanently deleting branches;
- changing the canonical production alias.
