# Step 11 Onboarding Guide

## Goal
Get a real ICP user from first login to one saved comparison-ready conversation as quickly as possible.

## Definition Of Success
A user is successfully onboarded when they have:
- configured at least one provider in `/settings`
- created at least one persona in `/personas`
- saved one conversation with at least one provider response in `/multi-chat`
- confirmed they can review saved work in `/comparison`

## Required Preconditions
The user needs:
- an account that can sign in
- at least one valid provider API key
- a realistic client brief they can test safely

## Exact Onboarding Path
1. Sign in
- go to the production app
- complete the normal sign-in flow

2. Configure providers
- open `/settings`
- go to `API Providers`
- add at least one real provider key
- preferred for Step 11: configure two providers if they normally compare vendors
- confirm the provider configuration saves successfully

3. Create one persona
- open `/personas`
- create a persona that matches a real delivery style
- examples:
  - client strategy memo
  - concise research analyst
  - conversion copy editor
- keep the first persona simple and realistic

4. Run the first brief
- open `/multi-chat`
- enter one real but safe client brief
- run it through the configured models/providers
- wait for at least one successful provider response
- confirm the conversation is saved

5. Review the saved work
- open `/comparison`
- confirm the saved conversation appears in the comparison flow
- inspect differences between outputs
- ask whether this is more useful than their current tab-switching workflow

6. Check analytics last
- open `/analytics`
- confirm the product is recording workflow activity
- do not frame analytics as the product value; it is validation and visibility

## Optional Next Surfaces
These are optional after the first successful run:
- `/ai-roundtable` for multi-agent debate around one goal
- `/goal-hub` for planning tracked deliverables
- `/pipeline` for staged review and handoff

## First-Run Troubleshooting
If provider setup fails:
- recheck the API key in `/settings`
- confirm the provider is actually enabled and saved

If no chat response is produced:
- simplify the brief
- reduce to one or two providers first
- confirm the provider key works

If comparison looks empty:
- confirm the conversation was saved
- confirm at least one provider returned content
- reload `/comparison`

If persona creation is confusing:
- use a simple title and one-paragraph instruction set
- avoid over-designed persona text on the first run

## What To Capture During Onboarding
Record for each user:
- time to configure first provider
- time to create first persona
- time to first saved conversation
- whether comparison review succeeded
- where they got blocked
- whether they would try it again on real client work

## Allowed Step 11 Fixes If Users Get Stuck
- clarify provider setup copy
- clarify persona instructions
- clarify comparison-ready completion state
- fix onboarding confusion on the first-run path

## Not Part Of This Guide
- long-term retention analysis
- enterprise rollout
- custom migrations for one prospect
- broad feature requests unrelated to first value
