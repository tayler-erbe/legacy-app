# 05 — Decisions Needed Before Locking

These need answers in Phase 0. Until they are answered, `config/scoring.yaml` stays `locked: false`.

## Scope
1. **Which workloads matter?** Rank W1–W7 (`test-suites/workloads.yaml`) and mark which are *critical* (gate G5 applies).
2. **Which users and apps will call this, and from where?** This sets the latency measurement point (F7).
3. **What is expected peak load?** Requests/s, tokens per request, batch rows/day.
4. **What is the SLO?** p95 latency per workload, availability target.

## Models
5. **Track A model:** which open-weight model (and size) do we standardize on? It must be runnable on all three.
   Before committing, check whether it is in each platform's managed catalog or needs a BYO deployment.
6. **Precision:** do we allow quantization on-prem (FP8/INT4)? If so, is the managed side matched or just recorded?
7. **LLM judge:** which model, hosted where (must be neutral — F10)?

## Data & security
8. Which **data classification** may go into the cloud trials? Do we need synthetic or masked data?
9. Required **regions / residency** (G1).
10. Do we need **air-gapped** operation for any workload? (This would favour on-prem by definition. Make it a gate if it is required.)

10a. Are **frontier proprietary models** (Claude/GPT/Gemini-class) acceptable for any workload? If yes, Track B must include them, and on-prem's quality gap is measured, not assumed (see `06-capability-map.md`).

## Resources & timeline
11. Engineering **effort budget** per platform (proposal: 80 h build + 40 h tuning).
12. **Snowflake trial ends in ~74 days** (as of 2026-11-11). Extend it to a formal POC, or schedule it first?
13. Databricks trial/POC status and credits.
14. **On-prem hardware:** what do we have now vs. what we would buy? If they differ, results get marked *projected* (see the methodology's threats table).

## Governance
15. Decision owner and sign-off group.
16. Weights in `config/scoring.yaml`: does each stakeholder group agree? Collect each group's weights for the sensitivity analysis.
