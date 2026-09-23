# Guard Portal — Verification Log

| Field           | Value                          |
| --------------- | ------------------------------ |
| **Status**      | TESTED                         |
| **Last Tested** | 2026-02-17                     |
| **Test Method** | Playwright + browser_snapshot  |
| **Tested By**   | Coding agent (automated browser run) |

## Workflows Tested

| ID  | Workflow                                    | Result | Notes                         |
| --- | ------------------------------------------- | ------ | ----------------------------- |
| W11 | Guard dashboard shows "Welcome, Test Guard" | FAIL   | Runtime error — see BUG-005   |
| W12 | "You are logged in as a guard" text         | FAIL   | Page crashed before rendering |
| W13 | Sign Out button visible                     | FAIL   | Page crashed                  |
| W14 | Sign Out redirects away                     | FAIL   | Could not test                |

## Known Issues

- [BUG-005](../bugs/BUG-005-guard-dashboard-crash.md) — `guards:getMyProfile` throws "Guard profile not found" for seeded Test Guard. **CRITICAL** — blocks entire guard portal.

## Guard Login Tests

| ID  | Workflow                        | Result | Notes                                                                |
| --- | ------------------------------- | ------ | -------------------------------------------------------------------- |
| W15 | Navigate to `/guard/login`      | PASS   |                                                                      |
| W16 | Enter created guard credentials | PASS   | Phone 8888888888, password NewPass123!                               |
| W17 | Login redirects to dashboard    | FAIL   | Stays on login with "Invalid phone number or password" — see BUG-006 |
| W18 | Destination page loads          | FAIL   | No redirect occurred                                                 |
| W19 | Empty form validation           | PASS   | Shows required field errors                                          |
| W20 | Invalid phone validation        | PASS   | "Enter a valid 10-digit phone number"                                |
| W21 | Wrong password error            | PASS   | "Invalid phone number or password"                                   |

## Known Issues

- [BUG-005](../bugs/BUG-005-guard-dashboard-crash.md) — Guard dashboard runtime crash
- [BUG-006](../bugs/BUG-006-created-guard-login-fails.md) — Admin-created guard can't login after password reset
