# 04 — TCO Model

## 1. The common unit

> **Cost per 1,000 successful tasks, meeting the SLO**, for each workload.
> Plus total 3-year and 5-year TCO at **low / expected / high** demand.

"Successful" means the task passed its quality check. A cheap platform that fails more often pays for those
failures, because it needs more attempts or human review per successful result.

## 2. Cost components

| Component | Snowflake | Databricks | On-prem |
|-----------|-----------|------------|---------|
| Inference | Cortex AI credits / tokens; SPCS GPU compute-pool credits for BYO models | Foundation Model API (pay-per-token or provisioned throughput) / Model Serving GPU DBUs | Amortized GPU servers (see §3) |
| Retrieval / search | Cortex Search serving + indexing | Vector Search endpoints + sync | Vector DB servers/storage (amortized) + ops |
| Orchestration / warehouse compute | Warehouse credits used by AI SQL, agents, SQL tools | SQL warehouse / jobs compute DBUs | CPU servers / Kubernetes nodes |
| Storage | Storage $/TB-month | Cloud object storage + Databricks | Disks/SAN, replicas, backup |
| Network | Egress, cross-region | Egress, cross-region, NAT | WAN/LAN upgrades if needed |
| Platform / licence | Edition uplift, support tier | Tier uplift, support | Software support (OS, K8s, vLLM enterprise support if any), monitoring tools |
| People | FTE share to build & run | FTE share to build & run | FTE for MLOps, GPU/infra ops, security patching, 24×7 on-call |
| Facilities | — | — | Rack space, power × PUE, cooling, hardware maintenance contracts |
| Lifecycle | Migration/exit cost | Migration/exit cost | Hardware refresh (3–5 yr), spares, failures, residual value |

## 3. On-prem amortization

```
annual_hw_cost   = (capex - residual_value) / useful_life_years + maintenance_contract
annual_power     = avg_kW × PUE × 8760 h × $/kWh
annual_people    = FTE × loaded_cost
annual_onprem    = annual_hw_cost + annual_power + facilities + software_support + annual_people
cost_per_task    = annual_onprem / successful_tasks_per_year
```

On-prem cost per task depends heavily on **utilization**. Always show it as a curve (10%–90% GPU utilization),
not as one number. Mark the utilization our projected demand actually produces.

## 4. Cloud cost

- Use **measured** consumption from Phase 3/4 runs (credits/DBUs/tokens per task), not calculator estimates.
- Price at both list price and our negotiated/quoted rate (F12), each labelled.
- Include idle cost: provisioned throughput, minimum endpoint replicas, and warehouses that do not scale to zero.

## 5. Demand scenarios

| Scenario | Definition (fill in Phase 0) |
|----------|------------------------------|
| Low | e.g. pilot: 1 team, N requests/day |
| Expected | Year-1 adoption plan |
| High | Year-3 growth or org-wide rollout |

Also show the **break-even point**: the demand level above which on-prem becomes cheaper than each cloud option, and below which it is more expensive.

## 6. Inputs to collect

Fill in `templates/tco-inputs.csv`. Each input needs a **source**, such as a quote, invoice, measured value, or named assumption.
