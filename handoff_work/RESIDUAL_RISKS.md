# Residual Risks

## RISK-001 Transitive dependency advisories remain open
- Owner: Repo operator
- Scope: `prisma` CLI tree and `vercel` dev dependency tree as captured in `15.1`
- Why accepted now: clean resolution requires non-trivial version upgrades, not a safe in-place patch
- Containment: explicitly documented; not hidden from release status
- Technical handoff blocker: no

## RISK-002 External preview/deploy integrations still create optional PR noise
- Owner: Infra owner
- Scope: Vercel / Netlify / Cloudflare status noise on PRs
- Why accepted now: branch protection only requires `Quality Checks` and `Smoke Tests`
- Containment: merge path remains deterministic despite non-blocking external noise
- Technical handoff blocker: no

## RISK-003 Optional Python sidecar is not part of live core production proof
- Owner: Repo operator
- Scope: sidecar remains outside the locked core production contract
- Why accepted now: sidecar stream parity exists and fallback behavior is covered; live core release does not depend on sidecar
- Containment: sidecar is treated as optional, not silently relied upon for core app health
- Technical handoff blocker: no
