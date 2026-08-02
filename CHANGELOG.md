# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0-private-pilot.3] - 2026-08-02

### Added

- Kimi as a first-class provider across encrypted Settings configuration,
  chat, streaming, model selectors, workflows, analytics, and the optional
  Python sidecar.
- Current OpenAI and Anthropic model options across catalog-backed selectors,
  including GPT-5.6 and the Claude 5 family.
- DeepSeek V4 Flash as a credentialless provider through the supplied public,
  community-hosted Hugging Face endpoint, with privacy warnings, streaming,
  reasoning-effort support, conservative rate limiting, and `Retry-After`
  handling.

### Changed

- Replaced demo and guest access with durable OAuth-first accounts, strict
  authenticated sessions, owner/admin allowlists, and guarded legacy-user
  cleanup.
- Kept public password registration disabled until verified email ownership,
  reset, and account-recovery controls are implemented.

### Fixed

- Buffered shared SSE chunks that arrive across network-packet boundaries.
- Allowed production verification to resolve the first valid PostgreSQL URL
  from the supported Vercel environment variables while still failing closed
  when no valid URL exists.

### Release scope

- Production Google OAuth account creation and sign-in were manually verified.
- Production DeepSeek selection, request streaming, and response rendering were
  manually verified with non-sensitive test data.
- The DeepSeek endpoint remains shared, public, rate-limited, and without an
  SLA; sensitive or private prompts must not be submitted.

## [0.2.0-private-pilot.2] - 2026-07-30

### Security

- Updated `python-multipart` to 0.0.31 to reject negative
  `Content-Length` values before reading request bodies (CVE-2026-53540).

## [0.2.0-private-pilot.1] - 2026-07-30

### Added

- Deterministic, attribution-safe private-pilot invite generation and a
  validated 10-prospect tracker.
- An exact full-SHA guard for verifying the canonical production alias.
- Provider catalog and generated-artifact hygiene checks.

### Changed

- Standardized the supported toolchain on Node.js 22 and npm.
- Made coverage floors, secret scanning, production dependency auditing, and
  critical full-tree dependency auditing blocking CI gates.
- Updated `python-dotenv` to 1.2.2 and `python-multipart` to 0.0.30.

### Fixed

- Restored the optional Python sidecar test suite on Python 3.14 and pytest 9.
- Aligned production verification with the deployed release's exact full
  commit SHA.

### Release scope

- This is an invite-only, founder-led private-pilot milestone. It is not a
  public launch and does not claim user, retention, revenue, or live-payment
  validation.
- Broad legacy feature pull requests remain deferred and are not part of this
  release.

## [0.1.0] - 2026-05-18

### Added

- Stable baseline for the multi-provider LLM workspace, including chat,
  personas, saved workflows, analytics, deployment documentation, and
  production operations tooling.

### Changed

- Replaced the former `1.0.0` / 2025 changelog entry with the repository's
  actual `v0.1.0-stable` tag date. The repository was created in January 2026,
  so the previous date could not represent a real project release.
