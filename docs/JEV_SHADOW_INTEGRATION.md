# Jev shadow evaluation

This experimental integration uses the TypeSafe System One decision API. It does not change existing model routing.

Server-only configuration: `TYPESAFE_API_KEY`, `JEV_SHADOW_ENABLED=true` and optional `JEV_MODEL=jev-latest`.

The TypeSafe HTTP endpoint is `https://api.typesafe.ai/v1/systemone`. Production is unchanged unless the shadow feature is explicitly enabled. Validate the model, decision outcomes, and performance before any automatic routing.
