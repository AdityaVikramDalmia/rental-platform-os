# ⚠️ Phase 23: Reference Only — Split Into P24 + P25 + P26

This directory is a marker only. The original **Phase 23** scope (Deal Communication Room + Rent Negotiation) was analyzed and found to be approximately **2.5-3x larger** than the largest existing phase (**P22**, 19 tasks). To keep implementation executable and within project sizing conventions, the scope was split into three implementation phases.

## Split Mapping

- **P24: Chat Infrastructure** — Core chat schema, backend, AI rewrite pipeline, basic chat UI.
- **P25: Deal Room Features** — Deal checklist, multi-party approvals, owner invite, admin god-mode.
- **P26: Rent Negotiation** — 3-room architecture, terms proposals, token advance, mandatory checklist, admin negotiation queue.

## Source Feature Specs

- [Deal Room spec (P24 + P25 source)](../../notes/features/18-deal-room.md)
- [Rent Negotiation spec (P26 source)](../../notes/features/19-rent-negotiation.md)

## Reference Note

`tasks/README.md` keeps the original **Phase 23** entry and scope text for historical/reference context. Actual implementation planning and execution now live in **P24-P26**.

## Why Split?

- Original combined scope estimated at **~30-35 tasks** across **~8-10 epics**.
- Project convention targets a maximum of **5 epics / ~19 tasks** per phase.
- Split preserves vertical value delivery: **transport → deal workflow → negotiation engine**.
- This sequencing aligns with `notes/features/19-rent-negotiation.md`, which already specifies **Priority: #24 (after Deal Room)**.
