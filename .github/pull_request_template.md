## Summary

-

## Data/process documentation checklist (required)

- [ ] I updated `DATABASE.md` for any schema/data behavior changes.
- [ ] I updated `PROCESSDATA.md` for any process/data-flow changes.
- [ ] If legacy/fallback behavior changed, I updated `docs/legacy-deprecation-plan.md` and telemetry where needed.

## Runtime impact

- [ ] No runtime behavior changes
- [ ] Runtime behavior changed (describe below)

## Validation

- [ ] Tests/checks run locally and captured in PR description

- [ ] I did not add new legacy compatibility path coupling (or explained why this deprecation-only change is needed).
