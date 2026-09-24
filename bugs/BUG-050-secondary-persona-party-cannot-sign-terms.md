# BUG-050: A tenant or owner who holds their deal role as a secondary persona can never sign proposal terms

| Field          | Value                        |
| -------------- | ---------------------------- |
| **Severity**   | High                         |
| **Status**     | **OPEN**                     |
| **Area**       | Negotiation / Terms sign-off |
| **Found**      | 2026-09-24                   |
| **Fixed**      | —                            |
| **Fix Commit** | —                            |

## Description

A user can be linked to a negotiation as its owner or tenant through a secondary persona, but `signTerms` then rejects their signature. Both signatures are required, so the negotiation can never reach `TERMS_AGREED`.

## Repro Steps

1. `npx vitest run convex/negotiationProposals.test.ts -t "BUG-050"` (selects both BUG-050 tests)

Both are `it.fails` tests: they pass while the bug exists and start failing once it is fixed. To see the error, change `it.fails` to `it`.

## Expected

The negotiation's linked tenant and owner can sign, whether they hold the role as their primary `user_type` or through `user_types`, and the second signature moves the negotiation to `TERMS_AGREED`.

## Actual

`signTerms` throws `Only linked tenant/owner can sign proposal terms` for the secondary-persona party. The proposal stays `SHARED` and the negotiation stays in `TERMS_PROPOSED`.

## Root Cause

`resolveSignerRole` (`convex/negotiationProposals.ts:234-250`) identifies the signer by the legacy primary `user.user_type` only (lines 236 and 243). The steps that put a user into a negotiation use the multi-persona list instead: `negotiations.linkOwnerToNegotiation` accepts any user whose `user_types` includes OWNER (`convex/negotiations.ts:454`), and negotiation initiation accepts a tenant whose `user_types` includes TENANT (`convex/negotiations.ts:307`). So a user whose primary type is TENANT with OWNER added as a second persona (or the reverse) is linked but rejected at signing.

The same primary-type-only check appears in `negotiationProposals.getActiveProposal` (`convex/negotiationProposals.ts:914`, `:919`) and in `negotiationTokens.tenantAgreeToPolicy` / `getForNegotiation` (`convex/negotiationTokens.ts:94`, `:297-304`).

## Fix

Not fixed yet. Proposed: in `resolveSignerRole`, decide the role with the same persona form that linking uses, `user.user_types?.includes(USER_TYPE.TENANT) ?? user.user_type === USER_TYPE.TENANT` (and the OWNER equivalent), as in `convex/negotiations.ts:307` and `:454`. Keep the id match against `negotiation.tenant_user_id` / `owner_user_id`. Apply the same change to the other call sites listed above.
