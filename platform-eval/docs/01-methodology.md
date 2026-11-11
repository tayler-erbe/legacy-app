# 01 — Methodology

## 1. Questions this evaluation must answer

1. **Can each platform do our workloads at all?** Pass/fail gates: security, data residency, required capabilities.
2. **How well does it do them?** Task quality on *our* data, scored against golden answers.
3. **How fast and how reliably?** Latency and throughput at our expected load, and behaviour under failure.
4. **What does it really cost?** Total cost of ownership over 3 and 5 years at realistic utilization.
5. **What does it take to run?** Engineering effort, operational burden, skills, and lock-in/exit cost.

Questions we are *not* answering: which model is the smartest in general. Public leaderboards
already cover that. We want to know which **platform** best runs **our** workloads under **our** constraints.

## 2. Two tracks: separate the platform from the model

| Track | Model | What it isolates | Primary use |
|-------|-------|------------------|-------------|
| **A — Controlled** | The **same open-weight model and version** on all three (e.g. one Llama/Mistral/Qwen-class model; chosen in Phase 0). Same precision where possible; any difference recorded. | Platform effects only: serving stack, latency, cost, ops, data integration | Headline platform comparison |
| **B — Best-effort** | Each platform uses its best option for the workload (managed catalog model, its own text-to-SQL/agent product, our best on-prem model) | The real experience a team would get on each platform | Practical "what would we actually ship" view |

Rules:
- If the Track A model is **not in a platform's managed catalog**, deploy it as a bring-your-own model
  (Snowflake: Snowpark Container Services / model registry; Databricks: custom Model Serving endpoint).
  Record this. It affects both effort and cost.
- In Track A, **quality differences should be small**. A large gap points to a serving defect: wrong chat
  template, truncated context, heavier quantization, or different default sampling. Find the cause before reporting it.
- Platform-native products (Snowflake Cortex Agents/Analyst/Search, Databricks Genie/Agent Framework/Vector Search)
  are evaluated in **Track B**, against an equivalent on-prem build of the same capability.

## 3. Fairness controls

| # | Control | How it is enforced |
|---|---------|--------------------|
| F1 | **Identical inputs** | Same prompts, system prompts, documents, tables and tool definitions. Every dataset is versioned and SHA-256 hashed; the hash goes in every result record. |
| F2 | **Identical decoding** | Same `temperature` (0 for scored runs), `top_p`, `max_tokens`, stop sequences. Platform defaults are never relied on; they are set explicitly and logged. |
| F3 | **Equal engineering budget** | Each platform gets the same time-boxed hours for setup and tuning (proposed: 80 h build + 40 h tuning). All hours go in `templates/effort-log.csv`, including vendor SA hours, which are reported separately. |
| F4 | **Same retrieval inputs** | For RAG, all three use the same chunked corpus. Track A also uses the same chunking and the same embedding model. Track B may use native retrieval. |
| F5 | **Same tools for agents** | Agent tests expose the same tool set (SQL query, document search, one or two business APIs), ideally through **one shared MCP server**, so all three platforms call identical tools. |
| F6 | **Cache neutralization** | Disable or bypass result caches for timing runs (e.g. Snowflake `USE_CACHED_RESULT = FALSE`; on-prem prefix cache on/off reported as separate configurations). Report both warm and cold numbers; never mix them. |
| F7 | **Network parity** | Measure end-to-end latency **from where real users/apps sit**. Report server-side latency separately. On-prem is on the LAN, so it gets no hidden advantage in the headline number unless real users are on that LAN too. |
| F8 | **Repeated, time-spread runs** | Performance runs are repeated ≥3 times on different days and times of day, to capture shared-cloud noise and on-prem contention. |
| F9 | **Blind grading** | Human and LLM-judge graders see outputs with platform identity removed and order randomized. |
| F10 | **Neutral judge** | The LLM judge is not any contender's Track A model, and it runs on infrastructure independent of all three. |
| F11 | **Same privilege model** | Tests run as a dedicated least-privilege service role on each platform, not an admin role (e.g. not `SYSADMIN`/`ACCOUNTADMIN` in Snowflake), so security and governance results reflect production. |
| F12 | **Pricing basis declared** | Each cost uses list price **and** our negotiated/quoted price, labelled. Trial or free credits never count as cost savings. |
| F13 | **Pre-registration** | Gates, weights, metrics and thresholds are locked (`config/scoring.yaml: locked: true`) before Phase 3. Every later change goes in the change log with a reason and approver. |
| F14 | **Version pinning** | Model versions, platform release, serving engine version, driver/CUDA versions are recorded in `config/platforms.yaml` for each run. If the platform changes mid-test, affected runs are redone. |

## 4. Threats to validity (and mitigations)

| Threat | Why it matters | Mitigation |
|--------|----------------|------------|
| Vendor-supplied benchmarks/demos | Optimized for their best case | Only our harness and our data count toward scores; vendor demos are context only |
| Hidden quantization on managed endpoints | Lower quality or higher speed that isn't comparable | Ask the vendor in writing; record it; in Track A run on-prem at the same precision where known |
| Rate limits / quotas on trials | Throttling looks like poor performance | Confirm quotas in writing up front; request increases; flag any run that hit a 429/quota error |
| Trial account limits (features, GPU compute, regions) | Trial ≠ production | List the feature/region/compute differences between the trial and production; re-test gated items on a paid/POC account if needed |
| Trial expiry (Snowflake trial shows ~74 days left as of 2026-11-11) | Testing gets squeezed or cut short | Schedule Snowflake phases first; request a POC extension early |
| On-prem hardware ≠ production hardware | Under- or over-states on-prem | Test on the hardware class we would buy; otherwise scale results with a documented model and mark them *projected* |
| Model updates mid-evaluation | Results not reproducible | Pin versions (F14); re-run the Track A smoke set weekly to detect drift |
| Golden set leakage / overfitting during tuning | Inflated quality scores | Split each dataset into **dev (tuning)** and **held-out test** sets; only the held-out set is scored; the test set is not shown to the people tuning |
| Small sample sizes | Noise read as signal | Minimum sample sizes and confidence intervals (see `03-scoring.md`); differences inside the CI are reported as ties |
| Evaluator bias toward a preferred option | Decides the outcome | Blind grading (F9), pre-registration (F13), and at least one reviewer from outside the team |

## 5. Roles

| Role | Responsibility |
|------|----------------|
| Decision owner | Approves gates/weights, signs the final recommendation |
| Eval lead | Owns this framework, the change log, and the harness |
| Platform leads (×3) | One engineer per platform; builds within the effort budget |
| Graders | Label golden sets, do human grading and judge calibration; not platform leads |
| Security/compliance reviewer | Scores the governance dimension from evidence |
| Finance partner | Validates TCO inputs and pricing quotes |
