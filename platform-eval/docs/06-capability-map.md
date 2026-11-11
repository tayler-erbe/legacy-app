# 06 — Capability Map: Snowflake vs Databricks vs Build-Yourself

> **As of 2026-11-11.** Both vendors ship AI features monthly, so treat this as the *hypothesis* to verify in
> Phase 2, not a fact. Items marked **(verify)** come from secondary sources or have unclear GA status.
> "Has it" ≠ "does it well": that's what the test plan measures. This map tells us **what to test where**.

Legend: ● native & managed · ◐ possible with extra components / preview / partial · ○ not offered ·
On-prem column = typical open-source building block and **build effort** (L/M/H).

---

## 1. Category-by-category

| # | Category | Snowflake | Databricks | Build-yourself (on-prem) |
|---|----------|-----------|------------|--------------------------|
| 1 | **Where it runs** | ● Fully managed SaaS in Snowflake's cloud account (AWS/Azure/GCP regions) | ● SaaS control plane; compute either serverless (Databricks account) or classic **in your own cloud account/VPC** | ● Your hardware, your network, can be air-gapped · **H** |
| 2 | **Storage & open formats** | ● Native tables + Iceberg tables; Horizon/Polaris catalog for Iceberg | ● Delta Lake native + Iceberg (UniForm); open-source lineage (Spark, Delta, MLflow) | ◐ MinIO/Ceph + Iceberg/Delta + Trino/Spark · **H** |
| 3 | **Governance & catalog** | ● Horizon Catalog: RBAC, masking/row policies, lineage, AI calls inherit warehouse permissions | ● Unity Catalog: RBAC, ABAC, lineage across data, models, functions, agents (OSS version exists) | ◐ Unity Catalog OSS / OpenMetadata + OPA/Ranger; **propagating permissions into RAG/agents is on you** · **H** |
| 4 | **Ingestion / pipelines** | ● Openflow, Snowpipe, Dynamic Tables | ● Lakeflow Connect, Declarative Pipelines, Jobs | ◐ Airflow/Dagster + Kafka + dbt · **M** |
| 5 | **Operational Postgres** | ● Snowflake Postgres (in your nav) | ● Lakebase (Neon-based, branching) | ● Plain Postgres · **L** |
| 6 | **Frontier proprietary models** (Claude, GPT, Gemini) | ● Hosted inside Cortex (e.g. OpenAI partnership; Anthropic models) | ● Foundation Model APIs / hosted models (OpenAI, Anthropic, Gemini, others) | ○ **Cannot self-host closed models.** Only via external API, which breaks the on-prem premise |
| 7 | **Managed open-weight models** | ● Catalog of open models in Cortex (selection is vendor-curated) | ● Pay-per-token + provisioned throughput for open models | ● Any model, day-0, any precision · **M** |
| 8 | **Bring-your-own model on GPUs** | ◐ Snowpark Container Services GPU pools + model registry (you run the container) | ● Custom Model Serving endpoints, serverless GPU (AI Runtime, preview in places) **(verify)** | ● vLLM / SGLang / TGI on your GPUs; full control of quantization, batching, spec-decoding · **M** |
| 9 | **LLM functions inside SQL (batch)** | ● Cortex AI SQL functions (`AI_COMPLETE`, classify, filter, aggregate, extract…) | ● AI Functions (`ai_query`, `ai_classify`, `ai_extract`…) | ◐ UDF/batch job calling vLLM offline mode · **M** |
| 10 | **Document parsing (PDF → structure)** | ● `AI_PARSE_DOCUMENT` / `AI_EXTRACT` (Document AI lineage) | ● `ai_parse_document` | ◐ Docling / Unstructured / OCR models · **M** |
| 11 | **Vector / hybrid search** | ● Cortex Search (managed hybrid search service) | ● Vector Search (Delta-synced indexes) | ● pgvector / Qdrant / Milvus / OpenSearch · **M** |
| 12 | **Text-to-SQL / semantic layer** | ● Cortex Analyst + semantic views | ● Genie (AI/BI) + metric views | ◐ dbt/Cube semantic layer + custom NL→SQL agent; accuracy is hard to get right · **H** |
| 13 | **Agent builder & runtime** | ● Cortex Agents / Agent Studio, Snowflake Intelligence (business UI), managed runtime, code execution **(verify)** | ● Agent Bricks (auto-optimized agents) + Agent Framework; supports LangGraph/CrewAI/OpenAI SDK; managed memory, sandboxes **(verify)** | ◐ LangGraph / other OSS frameworks + your own runtime, memory, sandboxing · **H** |
| 14 | **MCP** | ● Managed MCP server; MCP connectors (Jira, GitHub, Slack…); Native Apps can expose tools | ● Managed MCP servers (UC functions, Vector Search, Genie) + external MCP via gateway **(verify)** | ● Any MCP server you write/host · **L–M** |
| 15 | **AI gateway / guardrails** | ● Cortex AI Guardrails (GA 2026) · ◐ "AI Gateway" appears in your trial nav; scope not yet confirmed **(verify)** | ● Unity AI Gateway (rate limits, logging, guardrails for models, agents, MCP) | ◐ LiteLLM / Envoy + Llama Guard-class models + Presidio · **M** |
| 16 | **GenAI evaluation & tracing** | ◐ AI Observability (TruLens-based) eval & tracing **(verify depth)** | ● MLflow 3 GenAI eval, tracing, LLM judges, review app | ◐ MLflow OSS / Langfuse / Phoenix · **M** |
| 17 | **Classic ML / training** | ◐ Snowflake ML (notebooks on container runtime, feature store, registry, some distributed training) | ● Strongest: Spark, GPU clusters, distributed training, feature store, MLflow | ● Whatever you install; you own scheduling (Slurm/K8s/Ray) · **H** |
| 18 | **Fine-tuning** | ◐ Cortex fine-tuning for selected models **(verify current status)** | ◐ Fine-tuning / custom training on GPU compute **(verify current status)** | ● Full control (LoRA, full FT, RL); needs GPU & ML expertise · **M–H** |
| 19 | **End-user apps / chat UI** | ● Snowflake Intelligence, Streamlit in Snowflake, Native Apps | ● Databricks Apps, Genie spaces, Databricks One | ◐ Open WebUI / custom app + SSO · **M** |
| 20 | **Coding assistant on the platform** | ● Cortex Code ("CoCo" in your nav), works over MCP/ACP | ● Databricks Assistant / agent mode | ◐ OSS coding agents against your model · **M** |
| 21 | **Data/AI sharing & marketplace** | ● Secure Data Sharing, Marketplace, cross-account agent sharing **(verify)** | ● Delta Sharing (open protocol), Marketplace | ○ No ecosystem; point-to-point only |
| 22 | **Cost model** | Credits: compute + AI tokens on one bill | DBUs + (classic compute) your cloud VM bill; tokens or provisioned throughput | Capex + power + people; cost per token depends on **utilization** |

---

## 2. What BOTH Snowflake and Databricks do
These are **table stakes**. Their presence is not a differentiator, so test them for **quality, cost and speed only**:

- Hosted frontier models (OpenAI, Anthropic, Google) and a curated set of open-weight models
- LLM functions callable from SQL for batch work on tables
- Document parsing into tables
- Managed vector/hybrid search over governed data
- Natural-language-to-SQL over a semantic layer (Cortex Analyst vs Genie)
- Agent builder + runtime with MCP support and a business-user chat surface
- AI calls governed by the same catalog permissions as data
- Guardrails and gateway-style controls
- Bring-your-own model containers on GPUs
- Operational Postgres next to the analytics platform
- Iceberg interoperability, multi-cloud regions, marketplace/sharing
- An in-product coding assistant

→ **Test focus:** Track A/B quality on W1–W5, latency, $ per 1k successful tasks, and how well each one honors permissions (G3).

## 3. What NEITHER does
These are the **only areas where build-yourself is the answer by definition**:

- **Run on your own hardware / air-gapped / fully on-prem.** Both are cloud services; Databricks classic compute runs in *your cloud account*, not your data center.
- **Guarantee data and prompts never leave your physical premises.**
- **Fixed-cost capacity.** Both bill on consumption or provisioned throughput, so you don't own the GPUs.
- **Any open model, day-0, at the precision you choose, on a managed endpoint.** Possible only via BYO containers, which removes much of the "managed" benefit.
- **Full control of the serving stack** (kernels, batching policy, KV-cache/prefix-cache tuning, speculative decoding, LoRA multiplexing). BYO containers give partial control at best.
- **LAN-local latency** for users and apps inside your network.
- **Insulation from vendor roadmap and pricing changes.**

→ **Test focus:** these become **gates** (if any is a hard requirement, the cloud options fail G1) or **D8 strategic** scoring.

## 4. Where Snowflake is distinctive
- **Lowest operational burden.** No clusters to size; AI is "just SQL" on the same credit bill and the same RBAC.
- **Business-user agent experience.** Snowflake Intelligence + Agent Studio + Cortex Analyst semantic views for analysts and business users.
- **Sharing & Marketplace ecosystem**, now extending to sharing agents and Native Apps exposing tools to agents over MCP **(verify)**.
- **Cortex Code** as a platform-aware coding agent that also reaches non-Snowflake sources (Databricks, Glue, Postgres) **(verify)**.
- Single governed boundary: data never leaves the Snowflake account to reach the model (for Cortex-hosted models; confirm per model/region).

**Weaker relative to Databricks:** heavy custom ML/training and fine-grained control over GPU compute; fewer open-source escape hatches.

## 5. Where Databricks is distinctive
- **Open-source lineage & portability:** Delta, Spark, MLflow, and Unity Catalog OSS lower exit cost (D8).
- **Compute in your own cloud account** (classic) for network and security control.
- **Deepest ML/engineering toolkit:** distributed training, GPU clusters, MLflow GenAI evaluation & tracing, Agent Bricks auto-optimization.
- **Framework-agnostic agents** (LangGraph, CrewAI, OpenAI SDK) with managed memory and sandboxes **(verify)**.
- **Unity AI Gateway** governing models, agents *and* MCP traffic in one place.
- **Lakebase** Postgres with git-style branching for agent state/apps.

**Weaker relative to Snowflake:** more knobs means more to operate (cluster/warehouse choices, two bills on classic compute); business-user experience is typically judged less turnkey **(test in Track B)**.

## 6. Build-yourself: where it is ideal, and where it is not

### Ideal when…
| Situation | Why on-prem wins |
|-----------|-----------------|
| Data **must not leave premises**, or air-gap/sovereignty is required | Neither cloud option can meet it |
| **High, steady, predictable** inference volume (batch pipelines, always-on internal assistants) | Owned GPUs at high utilization beat per-token pricing; see the break-even curve in `04-tco-model.md` |
| You need **specific open-weight models**, custom fine-tunes, or specific quantization/serving tricks | Full control, no catalog wait |
| **Latency-critical apps on the LAN** | No WAN round-trip |
| You already own GPUs **and** have MLOps/infra staff with 24×7 coverage | Sunk capex; skills in place |
| Strategic goal to **avoid lock-in** / keep AI capability in-house | You own the stack and the know-how |
| Most of the data is *not* in Snowflake/Databricks today | No gravity pulling you to their AI layer |

### Not ideal when…
| Situation | Why on-prem loses |
|-----------|------------------|
| You need **frontier proprietary models** (Claude/GPT/Gemini-class quality) | Cannot be self-hosted; the open-weight quality gap varies by task, so **measure it in Track B** |
| Demand is **low, bursty or unknown** | Idle GPUs make cost per task very high at low utilization |
| Data and governance already live in Snowflake/Databricks | You'd rebuild permission propagation, lineage, audit, and the semantic layer, and keep copies in sync |
| **Business-user self-service** (NL→SQL, chat with data) is the main use case | Cortex Analyst/Genie-class accuracy needs a semantic layer, eval loops and UI. That's a product team's worth of work |
| Small team, no 24×7 GPU/infra on-call | Driver/CUDA/engine upgrades, failures and security patching are all yours |
| **Time-to-value** matters | GPU procurement lead times + build effort vs. a trial you can use today |
| You need to keep up with the feature pace | Both vendors ship monthly; on-prem means you own the upgrade cycle |

### Hybrid patterns to test (often the real answer)
- **On-prem for steady/sensitive workloads, cloud for bursty or frontier-model workloads.** Route through one gateway (LiteLLM on-prem, or Unity AI Gateway / Snowflake gateway pointing to external endpoints **(verify support)**).
- **Cloud platform for data + governance, on-prem for inference:** the agent runs in the platform and calls your on-prem OpenAI-compatible endpoint via external access. This tests whether governance survives the hop.

---

## 7. What this means for the evaluation

| Map bucket | How it's tested | Where in the plan |
|------------|-----------------|-------------------|
| Both do | Head-to-head quality/speed/cost; on-prem builds the equivalent within the effort budget | W1–W5, Track A + B |
| Neither does | Pass/fail requirement or strategic score | Gates G1/G2, D8 |
| Snowflake-distinctive | Track B; score effort saved and business-user experience | W2, W5, D7 |
| Databricks-distinctive | Track B; score ML depth, portability, gateway coverage | W5, D7, D8 |
| On-prem ideal/not ideal | TCO break-even curve, effort log, frontier-model quality gap | `04-tco-model.md`, D4, D7 |

**Add to Phase 0 decisions:** (a) is air-gap/on-premises processing a *hard requirement*? If yes, it is a gate and settles much of this.
(b) Are frontier proprietary models acceptable? If yes, Track B must include them, and on-prem's quality gap must be measured, not assumed.
