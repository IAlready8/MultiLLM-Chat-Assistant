# Security Exceptions

These exceptions cover development-only dependency advisories that cannot be
removed without replacing currently supported build tooling. Production
dependencies must continue to pass `npm audit --omit=dev --audit-level=high`.
The full dependency tree must continue to pass
`npm audit --audit-level=critical`.

The 2026-07-27 validation snapshot contains no production audit findings and
no critical full-tree findings. Remaining audit entries are limited to the
development/build-tool paths documented below.

## SEC-2026-07-01: Vercel CLI undici pin

- Owner: Repository owner
- Expires: 2026-08-15
- Dependency path: `vercel@56.5.0 > @vercel/node@5.8.26 > undici@5.28.4`
- Advisories: GHSA-c76h-2ccp-4975, GHSA-g9mf-h72j-4rw9,
  GHSA-cxrh-j4jr-qwg3, GHSA-2mjp-6q6p-2qxm, GHSA-vrm6-8vpv-qv8q,
  GHSA-v9p9-hfj2-hcw8, GHSA-4992-7rv2-5pvq, GHSA-p88m-4jfj-68fv,
  GHSA-vxpw-j846-p89q, GHSA-35p6-xmwp-9g52, GHSA-g8m3-5g58-fq7m
- Audit propagation: `@vercel/*`, `ts-morph`, and related builder findings are
  dependency propagation from the Vercel CLI toolchain and are covered by this
  exception.
- Reachability: `vercel` is a dev dependency. The affected client is not
  bundled into the Next.js application and is used only when an operator runs
  the pinned Vercel CLI against Vercel-controlled endpoints.
- Compensating controls: keep the CLI pinned to the latest release, do not use
  it with untrusted HTTP or WebSocket endpoints, keep production dependency
  audit blocking, and review `@vercel/node` releases weekly until its Undici
  pin reaches a non-vulnerable release.
- Removal condition: update the Vercel CLI as soon as its `@vercel/node`
  dependency no longer resolves a vulnerable undici version.

## SEC-2026-07-02: Babel 7 source-map file read

- Owner: Repository owner
- Expires: 2026-08-15
- Dependency path: `@vitejs/plugin-react@4.7.0 > @babel/core@7.28.5`
- Advisory: GHSA-4x5r-pxfx-6jf8
- Reachability: Babel runs only during local or CI transforms of repository
  source. The build does not compile attacker-supplied source files or accept
  attacker-controlled `sourceMappingURL` comments.
- Compensating controls: builds run from reviewed repository commits in
  isolated CI workers, generated or uploaded user content is excluded from the
  transform input, and the full-tree critical audit remains blocking.
- Removal condition: update to a Vite-compatible React plugin release that no
  longer resolves the affected Babel 7 range.

## SEC-2026-07-03: Development-tool brace expansion

- Owner: Repository owner
- Expires: 2026-08-15
- Dependency paths: ESLint, TypeScript ESLint, Vitest coverage, and Vercel CLI
  toolchains through `minimatch > brace-expansion`
- Advisory: GHSA-mh99-v99m-4gvg
- Reachability: the affected expansion code runs only in local or CI
  development tools against repository-controlled file patterns. It is not
  bundled into the production Next.js application and does not process
  user-supplied glob patterns at runtime.
- Compensating controls: patched releases are selected through npm overrides
  where the upstream major supports them, CI inputs are repository-controlled,
  production dependency audit remains blocking, and the full-tree critical
  audit remains blocking.
- Removal condition: remove this exception and the compatibility overrides
  when supported ESLint, Vitest, and Vercel toolchain releases no longer
  resolve affected brace-expansion majors.
