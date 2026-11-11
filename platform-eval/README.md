# AI Platform Evaluation Framework

**Contenders**

| ID | Platform | What we are actually testing |
|----|----------|------------------------------|
| `SNOW` | Snowflake (Cortex AI, Cortex Search/Analyst, Snowpark Container Services) | Managed LLM functions running next to warehouse data |
| `DBX` | Databricks (Mosaic AI Model Serving, Foundation Model APIs, Vector Search) | Managed lakehouse serving and MLOps |
| `ONPREM` | Custom build on our own hardware | Open-weight models served by us (e.g. vLLM/SGLang + our own vector store) |

**Goal of this phase:** define *how* we test before anyone runs a test. Nothing in this folder runs
against a platform yet. It decides what we measure, how we measure it, and how we
score it, and we lock those decisions before we see any results.

## Why it is built this way

A comparison like this usually goes wrong in one of four ways:

1. **Different models on each platform.** Then you are comparing models, not platforms.
   → We run a **controlled track** with the *same open-weight model weights* on all three, plus a
   separate **best-effort track** where each platform uses its best option.
2. **One side gets more tuning.** Vendor solution architects tune their platform, and our own
   engineers can keep tuning on-prem forever.
   → Every platform gets the **same time-boxed engineering budget**, and every hour is logged.
3. **Cost measured in different units.** Credits, DBUs and GPU capex can't be compared directly.
   → Everything is converted to **cost per 1,000 successful tasks at our SLO**, over 3 and 5 years,
   at a range of utilization levels.
4. **Weights picked after the results are in.** → Scoring weights and pass/fail gates are
   **pre-registered** and signed off before Phase 3. Any later change is logged with a reason.

## Contents

| Path | Purpose |
|------|---------|
| [`docs/01-methodology.md`](docs/01-methodology.md) | Principles, the two tracks, fairness controls, threats to validity |
| [`docs/02-test-plan.md`](docs/02-test-plan.md) | Phases, evaluation dimensions, the workload catalog, and test procedures |
| [`docs/03-scoring.md`](docs/03-scoring.md) | Gates, weights, 0–5 anchored scales, and the statistics rules |
| [`docs/04-tco-model.md`](docs/04-tco-model.md) | How cloud consumption and on-prem capex/opex become one comparable number |
| [`docs/05-decisions-needed.md`](docs/05-decisions-needed.md) | Open questions stakeholders must answer before the weights are locked |
| [`config/platforms.yaml`](config/platforms.yaml) | Environment manifest: the exact configuration each platform runs |
| [`config/scoring.yaml`](config/scoring.yaml) | Proposed weights, gates and scale anchors (not yet locked) |
| [`test-suites/workloads.yaml`](test-suites/workloads.yaml) | Workload catalog with metrics and dataset requirements |
| [`schemas/`](schemas/) | JSON Schemas for test cases and result records, so every platform's output is captured the same way |
| [`templates/`](templates/) | Effort log, run log, and scorecard templates |

## Phase gate checklist (before any test runs)

- [ ] Stakeholders named; decision owner identified (`docs/05-decisions-needed.md`)
- [ ] Workloads chosen from the catalog and prioritized
- [ ] Golden datasets built, versioned and hashed
- [ ] Gates and weights in `config/scoring.yaml` signed off → set `locked: true`
- [ ] Controlled-track model chosen and confirmed available (managed or BYO container) on all three
- [ ] Engineering effort budget per platform agreed
- [ ] Data-handling approval to load test data into each cloud trial
