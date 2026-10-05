# VeriSpec Rulebook — Testing Policy & Standards

> This rulebook defines the permanent testing philosophy for this project.
> VeriSpec reads this file to determine testing depth, required coverage levels,
> and quality gate thresholds. Customize it to match your team's standards.

> [!IMPORTANT]
> **Scope & Boundary (The Testing Constitution)**:
> This document governs **HOW** the project tests (quality gates, SLAs, tool rules, pass/fail criteria).
> - **DO NOT** list specific application features, endpoints (`/api/...`), database tables, or test scenarios here.
> - Specific requirements, endpoints, and test allocations belong strictly in `.verispec/strategy.md` (`/verispec-strategy`).
> - Step-by-step test cases belong strictly in `.verispec/cases/` (`/verispec-cases`).

---

## 1. Core Testing Principles

1. **Traceable Evidence**: Every functional requirement defined in specifications
   must be bound to at least one executable test. A requirement without a test
   is considered unverified.

2. **Layered Depth**: Critical business flows must have verification across
   multiple test tiers (Unit + API + Integration or E2E). A single tier is
   insufficient for high-risk requirements.

3. **Negative & Edge First**: Validation boundaries, error conditions,
   unauthorized access scenarios, and edge cases are mandatory test targets
   for every endpoint and user-facing feature.

4. **Deterministic & Isolated**: Tests must not depend on execution order,
   shared mutable state, or external service availability. Every test must
   be independently runnable and produce identical results.

5. **No Silent Destruction**: Existing tests must never be deleted or disabled
   without an explicit deprecation note linked to a spec change or requirement
   removal. Test coverage must not silently decrease.

6. **Risk-Proportional Investment**: Testing depth and effort must be
   proportional to business and technical risk. Not every feature needs E2E
   tests, but every critical flow does.

---

## 2. Test Level Definitions

### Unit Tests
**Use for:**
- Business logic and domain models
- Input validation and data transformation
- Pure functions and utility methods
- State machine transitions

**Standards:**
- Must execute in < 50ms per test
- No network calls, no database, no filesystem
- Mock external dependencies

---

### API Tests
**Use for:**
- HTTP endpoint behavior (status codes, headers, body)
- Request/response schema validation
- Authentication and authorization enforcement
- Rate limiting and input sanitization

**Standards:**
- Test against a running (or mocked) server instance
- Validate both success and error response shapes
- Include header assertions where security-relevant

---

### Integration Tests
**Use for:**
- Database read/write operations and migrations
- External service interaction (payment, email, storage)
- Multi-component workflows within the backend
- Message queue consumption and event handling

**Standards:**
- Use test containers or isolated test databases
- Clean up state after each test (transactions or teardown)
- Acceptable execution time: < 5s per test

---

### E2E Tests
**Use for:**
- Critical user journeys (signup, purchase, onboarding)
- Multi-page workflows that span frontend and backend
- Business-critical happy paths

**Standards:**
- Use real browser automation (Playwright, Cypress)
- Limit to critical paths only (E2E tests are expensive)
- Include visual assertions where UI correctness matters

---

### Security Tests
**Use for:**
- Authentication bypass attempts
- Authorization and role-based access control
- SQL injection, XSS, and IDOR probing
- Sensitive data exposure (PII in logs, responses)
- Token and session management

**Standards:**
- Every authenticated endpoint must have an unauthorized access test
- Every user-input field must have an injection test
- Rate limiting must be verified on auth endpoints

---

### Performance Tests
**Use when:**
- Specification defines latency or throughput requirements
- Endpoint handles high concurrency or large payloads
- Resource-intensive operations (reports, exports, batch jobs)

**Standards:**
- Define P95 latency thresholds before writing tests
- Use realistic data volumes
- Test under expected and 2x expected load

---

## 3. Quality Gate Thresholds

| Gate | Threshold | Enforcement |
|------|-----------|-------------|
| Critical requirement coverage | 100% | Release blocker |
| Overall test pass rate | ≥ 95% | Release blocker |
| Critical defects open | 0 | Release blocker |
| High defects open | 0 | Release blocker (waivable with sign-off) |
| Security test pass rate | 100% | Release blocker |
| Regression test pass rate | 100% | Merge blocker |

---

## 4. Human Review Gates

The following artifacts require explicit QE approval before downstream
commands may proceed:

- [ ] **Strategy** (`verispec.strategy` output) — Risk tiers and test level assignments
- [ ] **Test Cases** (`verispec.cases` output) — Coverage completeness and priority
- [ ] **Implementation** (`verispec.implement` output) — Code quality and correctness
- [ ] **Defect Classification** (`verispec.analyze` output) — Root cause accuracy

---

## 5. Naming Conventions

| Artifact | Pattern | Example |
|----------|---------|---------|
| Requirement ID | `REQ-{PREFIX}-{NNN}` | `REQ-JC-001` |
| Test Case ID | `TC-{PREFIX}-{NNN}` | `TC-JC-005` |
| Defect ID | `BUG-{PREFIX}-{NNN}` | `BUG-JC-003` |
| Run ID | `RUN-{YYYYMMDD}-{NNN}` | `RUN-20261005-001` |
| Test file (Python) | `test_{feature}.py` | `test_job_card.py` |
| Test file (TS/JS) | `{feature}.spec.ts` | `job_card.spec.ts` |

---

*Last updated: {{timestamp}}*
*VeriSpec v{{version}}*
