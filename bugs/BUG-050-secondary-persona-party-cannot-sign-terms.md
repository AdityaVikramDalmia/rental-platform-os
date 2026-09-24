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

`negotiationProposals.resolveSignerRole` (`convex/negotiationProposals.ts:234-250`) identifies the signer by the legacy primary `user.user_type` only (lines 236 and 243). The steps that put a user into a negotiation use the multi-persona list instead: `negotiations.linkOwnerToNegotiation` accepts any user whose `user_types` includes OWNER (`convex/negotiations.ts:454`), and negotiation initiation accepts a tenant whose `user_types` includes TENANT (`convex/negotiations.ts:307`). A user whose primary type is TENANT with OWNER added as a second persona (or the reverse) is therefore linked successfully but rejected at signing with "Only linked tenant/owner can sign proposal terms". Both signatures are required for `TERMS_AGREED`, so that negotiation can never get past terms.

The same primary-type-only check appears in `negotiationProposals.getActiveProposal` (`convex/negotiationProposals.ts:914`, `:919`) and in `negotiationTokens.tenantAgreeToPolicy` / `getForNegotiation` (`convex/negotiationTokens.ts:94`, `:297-304`).

## Repro Steps

1. `npx vitest run convex/negotiationProposals.test.ts -t "lets an owner linked through a secondary OWNER persona sign and complete TERMS_AGREED (BUG-050)"`
2. `npx vitest run convex/negotiationProposals.test.ts -t "lets the inquiry tenant sign when their primary persona is OWNER and TENANT is secondary (BUG-050)"`

Both are `it.fails` tests: they pass while the bug exists and start failing once it is fixed. To see the error, change `it.fails` to `it`.

## Expected

The negotiation's linked tenant and owner can sign, whether they hold the role as their primary `user_type` or through `user_types`, and the second signature moves the negotiation to `TERMS_AGREED`.

## Actual

`signTerms` throws `Only linked tenant/owner can sign proposal terms` for the secondary-persona party. The proposal stays `SHARED` and the negotiation stays in `TERMS_PROPOSED`.
