---
description: Run local equivalents of all six CI workflows and report pass/fail per check
---

Run everything `.github/workflows/` runs on every push/PR, locally, and
report results. Read-only with respect to git — do not commit, push, or fix
anything unless the user asks after seeing the report.

Run each check below, capturing pass/fail and the tail of any failure
output. Skip a check with a clear note if its tool isn't installed rather
than failing the whole command.

1. **Lint** (`ci-lint.yml`):
   ```bash
   ruff check .
   ruff format --check .
   mypy .
   cd frontend && npm run lint && npx tsc --noEmit && cd ..
   ```
2. **Tests** (`ci-tests.yml`):
   ```bash
   pytest --cov
   ```
3. **Build** (`ci-build.yml`):
   ```bash
   cd frontend && npm run build && cd ..
   ```
4. **Deps** (`ci-deps.yml`):
   ```bash
   pip-audit
   cd frontend && npm audit --audit-level=critical && cd ..
   ```
5. **Secrets** (`ci-secrets.yml`):
   ```bash
   gitleaks detect --source . -v
   ```
   If `gitleaks` isn't installed, say so and skip rather than attempting a
   substitute scan.
6. **Semgrep** (`ci-semgrep.yml`):
   ```bash
   semgrep --config p/python --config p/javascript --config p/typescript --config p/owasp-top-ten .
   ```
   If `semgrep` isn't installed, say so and skip.

At the end, print a summary table: check name → PASS / FAIL / SKIPPED
(tool missing) → one-line reason for any non-pass. If anything fails, do
not attempt fixes automatically — ask the user whether to fix, and only
proceed with their go-ahead, per the root `CLAUDE.md` approval gate for any
resulting commit.
