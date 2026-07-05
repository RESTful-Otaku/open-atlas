# Change Impact Analysis: [Change Description]

**Date**: [YYYY-MM-DD]
**Author**: [AI / Human]
**Related issue/PR**: [#123]

---

## 1. Proposed Change

_One paragraph describing what is being changed._

## 2. Scope

### Modules Affected

| Module | Type of Change | Risk |
|--------|---------------|:----:|
| [module] | [add/modify/delete] | Low/Med/High |
| [module] | [add/modify/delete] | Low/Med/High |

### Dependencies Added / Removed

- [ ] New dependency: [name@version] — why needed
- [ ] Removed dependency: [name] — why safe

## 3. Risk Assessment

### Breaking Changes

- [ ] Public API changes (interface, function signature)
- [ ] Database schema migration required
- [ ] Configuration format changes
- [ ] Behavioural change for existing callers

### Regression Vectors

_What existing behaviour could this break? How will we catch it?_

1. _Scenario_ — caught by [test type]
2. _Scenario_ — caught by [test type]

## 4. Verification Plan

- [ ] Existing tests pass
- [ ] New tests cover change
- [ ] Integration tests cover affected modules
- [ ] Manual smoke test (if applicable)

### Performance

- [ ] Benchmark before/after (if performance-sensitive)
- [ ] No regression expected (explain why)

## 5. Rollback Strategy

_How do we undo this change if something goes wrong?_

- **Revert commit**: `git revert <sha>`
- **Data migration**: [forward/backward migration commands]
- **Feature flag**: [name of flag to disable]

## 6. Timeline

- **Implementation**: [estimate]
- **Review**: [estimate]
- **Deployment**: [notes on deployment order if multi-service]

---

_Approved by:_
- [ ] Tech Lead
- [ ] Reviewer
