# Provider configuration secret boundary

The provider-config security correction keeps the dedicated credential encrypted
through the existing API-key service and prevents credentials from being stored
or returned as ordinary provider settings. It changes only the provider-config
route contract; authentication, ownership, provider dispatch and endpoint policy
remain enforced by their existing helpers.

## Request contract

`POST` and `PUT /api/provider-configs` accept `provider` and `config`. The dedicated
`config.apiKey` is processed separately by the existing route/key service.

Supported non-secret fields, either directly in config or inside config.settings:

- baseUrl, models, rateLimits (requests/window)
- organization, maxTokens, version
- safetySettings (an array of category/threshold objects)
- httpReferer, xTitle
- isActive and provider metadata

Top-level settings retain precedence over corresponding nested fields. The
existing model/rate defaults and endpoint validation still apply. Unknown fields
and malformed supported fields are rejected with HTTP 400 and
`PROVIDER_SETTINGS_INVALID`; they are not silently dropped. This intentionally
replaces the old arbitrary passthrough write contract. New integrations must
extend the reviewed allowlist and tests before introducing another setting.

Credential-like field names (including normalized API-key/header variants,
authorization, tokens, passwords, secrets, keys, seeds and cookies) are forbidden
recursively inside ordinary settings, including objects inside arrays. Rejection
occurs before key probing, storage and cache invalidation. Errors contain a fixed
message, not the submitted value or arbitrary field names. The dedicated
top-level config.apiKey remains the sole accepted credential field.

## Responses and legacy compatibility

A successful PUT retains success, data and connectionTest. data is constructed
from validated effective settings, with apiKey set to an empty string and a
normalized settings member; the submitted config is never echoed. Failed probes
continue to return their existing sanitized connection-test outcome without data.

GET continues returning configs keyed by operational provider. Before building or
caching the public response, credential-like fields are removed recursively from
legacy settings. Unknown non-secret legacy fields, arrays and ordinary values
are preserved. Stored objects are not mutated and no database rows are rewritten.
Such legacy extension fields are readable but must be removed or reviewed before
resubmitting through the stricter write contract. Traversal is bounded at 32
levels; deeper legacy values become null, while excessively nested writes fail.

This is field-based validation/redaction, not a generic secret-content detector.
It cannot identify a credential disguised as an otherwise valid model name or
ordinary string value. Existing stored data was not inspected for real secrets;
investigating or migrating it requires separate authorization.

## Security invariants and verification

DeepSeek remains disabled before settings/key/network work. Existing exact
provider endpoint checks, private-address policy, redirect rejection and
development-only loopback Ollama policy are unchanged. Credential encryption,
per-user storage identity and successful-write cache invalidation are unchanged.
The active /api/config ingress already constructs fixed non-secret settings and
does not forward arbitrary request settings. Unused legacy configuration helpers
were not rewritten by this correction.

Regression coverage lives in test/api-provider-configs-route.test.ts and
test/provider-settings.test.ts. Route regressions reproduced 26 failures before
the correction, including credential echo, nested storage and legacy GET leaks.
Tests use synthetic credentials and mocked auth/storage/provider transport.
Source checks and local tests are not evidence of deployed remediation.
