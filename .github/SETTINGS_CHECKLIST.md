# GitHub Repository Settings Checklist

## Manual Configuration Steps

After merging the CI/CD upgrade PRs, apply these settings manually in the GitHub UI.

---

## Branch Protection Rules

Navigate to: **Settings → Branches → main → Edit** (or Add rule if none exists)

### ✅ Pull Request Settings
- [x] **Require a pull request before merging**: Enabled
  - [x] Required approvals: **1**
  - [x] Dismiss stale reviews when new commits are pushed: **Enabled**
  - [ ] Require review from Code Owners: **Disabled initially** (enable after team grows)
  - [ ] **Require approval of latest push**: **Disabled** (too strict for small teams)

### ✅ Status Checks
- [x] **Require status checks to pass before merging**: Enabled
  - [x] Require branches to be up to date before merging: **Enabled**
  - **Required checks** (add these exact names):
    - `quality-checks` (or `Quality Checks`)
    - `smoke-tests` (or `Smoke Tests`)
    - (After PR-3) `security-scan` (or `Security Audit`)
    - (After PR-3) `analyze` (CodeQL)

### ✅ Additional Settings
- [x] **Require conversation resolution before merging**: Enabled
- [ ] **Require signed commits**: Disabled (optional - enable for enhanced security)
- [ ] **Require linear history**: Disabled (allows merge commits)
- [x] **Include administrators**: Enabled (rules apply to admins too)
- [ ] **Allow force pushes**: Disabled
- [ ] **Allow deletions**: Disabled

---

## Repository Settings

Navigate to: **Settings → General**

### ✅ Pull Requests
- [x] Allow squash merging: **Enabled** (recommended)
- [x] Allow merge commits: **Enabled**
- [ ] Allow rebase merging: **Disabled** (to prevent history confusion)
- [x] **Automatically delete head branches**: **Enabled** (keeps repo clean)
- [x] Allow auto-merge: **Enabled** (for approved PRs)

### ✅ Collaborators & Teams
- Review access levels
- Add team members with appropriate permissions

---

## Security Settings

Navigate to: **Settings → Security → Code security and analysis**

### ✅ Dependabot
- [x] **Dependabot alerts**: Enabled
- [x] **Dependabot security updates**: Enabled
- [x] **Dependabot version updates**: Enabled (configured via `.github/dependabot.yml`)
- [x] **Grouped security updates**: Enabled (reduce PR noise)

### ✅ Code Scanning
- [x] **CodeQL analysis**: Enabled (via `.github/workflows/codeql.yml`)
- [x] **Secret scanning**: Enabled
- [x] **Push protection**: Enabled (prevents pushing secrets)

### ✅ Private Vulnerability Reporting
- [x] **Enable private vulnerability reporting**: Enabled

---

## Actions Settings

Navigate to: **Settings → Actions → General**

### ✅ Actions Permissions
- [x] **Allow all actions and reusable workflows**: Selected
  - Or: Allow select actions (if more restrictive needed)
- [ ] **Allow GitHub Actions to create and approve pull requests**: Disabled by default  
  - Enable only if a specific, trusted workflow must create PRs, and prefer using scoped tokens or GitHub Apps where possible.

### ✅ Workflow Permissions
- [x] **Read repository contents permissions**: Selected (secure default)  
  - For workflows that need write access, grant it per workflow using the `permissions` key in the workflow YAML (rather than enabling global write).
- [ ] **Allow GitHub Actions to approve pull requests**: Disabled  
  - Avoid granting global approval rights; if automated approvals are ever required, restrict them to tightly controlled workflows and review the security implications.

### ✅ Artifact and Log Settings
- [x] Artifact retention: **90 days** (default, adjust if needed)
- [x] Log retention: **90 days**

---

## Integrations & Webhooks

Navigate to: **Settings → Integrations**

### ✅ Review External Integrations
Review and rationalize:
- **Vercel**: Keep, but make non-blocking (Status Checks section)
- **Netlify**: Keep if needed, make non-blocking
- **Cloudflare Pages**: Keep if needed, make non-blocking
- **Remove duplicates**: Check for multiple Vercel projects, keep only one

### ✅ Make External Checks Non-Blocking
1. In Branch Protection, do NOT add Vercel/Netlify/Cloudflare to "Required status checks"
2. They will still show in PR, but won't block merging

---

## Notifications

Navigate to: **Settings → Notifications** (your personal settings)

### ✅ Recommended Settings
- [x] Watch repository for: **All Activity** (for maintainers)
- [x] Email notifications for: **Participating, @mentions, CI failures**
- [ ] Dependabot alerts: **Enabled** (receive security alerts)

---

## Labels

Navigate to: **Issues → Labels**

### ✅ Ensure These Labels Exist
Create if missing (used by auto-labeling):
- `area: frontend` (color: #1d76db)
- `area: backend` (color: #0e8a16)
- `area: database` (color: #fbca04)
- `area: tests` (color: #d4c5f9)
- `area: ci/cd` (color: #5319e7)
- `area: docs` (color: #0075ca)
- `dependencies` (color: #0366d6)
- `security` (color: #d73a4a)
- `performance` (color: #d4c5f9)
- `size/xs` (color: #00ff00)
- `size/s` (color: #66ff66)
- `size/m` (color: #ffff00)
- `size/l` (color: #ff9900)
- `size/xl` (color: #ff0000)
- `automated` (color: #ededed)

---

## Required Secrets

Navigate to: **Settings → Secrets and variables → Actions**

### ✅ Repository Secrets
Verify these exist:
- `CLAUDE_CODE_OAUTH_TOKEN` (for Claude Code workflows)
- Add any others as needed for integrations

---

## Post-Configuration Validation

### ✅ Test PR Workflow
1. Create test branch: `git checkout -b test/branch-protection`
2. Make trivial change: `echo "test" >> README.md`
3. Push: `git push origin test/branch-protection`
4. Create PR to main
5. Verify:
   - [ ] Auto-labels applied (area, size)
   - [ ] Only 2-3 required checks (Quality Checks, Smoke Tests, optional Security)
   - [ ] External checks (Vercel/Netlify) present but not required
   - [ ] Cannot merge without approvals and passing checks
   - [ ] Can merge after approval and green checks
6. Close test PR without merging

### ✅ Test Security Scanning
1. Check Security tab → Code scanning alerts
2. Verify CodeQL has run at least once
3. Review and dismiss any false positives
4. Check Dependabot alerts are populating

### ✅ Monitor First Week
- [ ] CI runs complete in <3min with cache
- [ ] No "Expected" check deadlocks
- [ ] Dependabot creates PRs
- [ ] No merge confusion from external checks

---

## Rollback Instructions

If any setting causes issues:

1. **Branch Protection**: Edit rule, uncheck problematic setting
2. **Required Checks**: Remove from required list in Branch Protection
3. **CodeQL**: Disable workflow by renaming `.github/workflows/codeql.yml` to `.github/workflows/codeql.yml.disabled`
4. **Dependabot**: Delete `.github/dependabot.yml`
5. **Auto-merge**: Disable in Settings → General → Pull Requests

---

## Notes

- **Check names must match exactly**: Use the job name from workflow (e.g., `quality-checks` or `Quality Checks`)
- **Case sensitivity**: GitHub check names are case-sensitive
- **Wildcards**: Branch protection doesn't support wildcards in check names
- **Status check stability**: If check names change, update Branch Protection

---

## Completion Checklist

- [ ] Branch protection configured
- [ ] Required checks added (only 2-3 core checks)
- [ ] External checks made non-blocking
- [ ] Security features enabled
- [ ] Dependabot configured
- [ ] Labels created
- [ ] Test PR validated workflow
- [ ] Team notified of changes

---

**Last Updated**: 2026-03-02
**Maintainer**: @IAlready8
