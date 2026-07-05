# Post-Mortem: [Incident Name]

**Date**: [YYYY-MM-DD]
**Severity**: [SEV1 / SEV2 / SEV3]
**Duration**: [start time] — [end time] ([total duration])
**Participants**: [list of responders]

---

## 1. Summary

_One paragraph describing what happened and the impact._

## 2. Timeline

| Time (UTC) | Event |
|------------|-------|
| | Issue detected |
| | Investigation began |
| | Root cause identified |
| | Fix applied |
| | Service restored |
| | Monitoring confirmed |

## 3. Root Cause

_What was the underlying cause? Be precise. A bad deployment is not a root
cause — what about the deployment was wrong and why was it not caught?_

**Type**: [Code bug | Configuration | Infrastructure | Process | External]

## 4. Impact

- **Users affected**: [number or estimate]
- **Error rate**: [% increase during incident]
- **Latency**: [p50/p99 during vs normal]
- **Data loss**: [yes/no — details]

## 5. Detection

_How was this discovered? Monitoring alert? User report? Manual check?_

**Detection time**: [minutes from introduction to discovery]
**Gap**: [why wasn't it caught sooner?]

## 6. Contributing Factors

_Why did this happen? Not just the direct cause, but systemic factors:_

- Lack of test coverage for [scenario]
- Missing validation at [boundary]
- Insufficient monitoring for [signal]
- Review process missed [something]

## 7. Action Items

| Action | Owner | Tracked In | Priority |
|--------|-------|-----------|:--------:|
| | | | 🔴 |
| | | | 🟡 |
| | | | 🔵 |

## 8. Prevention

_How do we prevent this class of issue in the future?_

- **Process**: [changes to review, testing, deployment process]
- **Technical**: [automated checks, validation, monitoring]
- **Cultural**: [training, blameless culture notes]

## 9. Lessons Learned

_What went well? What would we do differently next time?_

### Went Well

- ...

### To Improve

- ...

---

*This post-mortem is blameless. The goal is to learn and improve systems, not
to assign fault.*
