# 03 — Scoring

## 1. Structure: gates first, then weighted score

1. **Gates (pass/fail).** A platform that fails a gate is **not scored**. It is eliminated, or flagged
   with the remediation it would need and that remediation's cost.
2. **Weighted score.** Each dimension gets a 0–5 score from **pre-defined anchors** (absolute thresholds, not
   "best platform = 5"). The weighted sum gives the overall score.
3. **Sensitivity analysis.** Re-compute the ranking with each weight ±50% and under each stakeholder group's
   weights. If the winner changes, the readout says so.

Relative scoring ("best gets 5, others scaled") is **not** used. It overstates small differences and makes
scores depend on which competitors happen to be in the comparison.

## 2. Proposed gates (confirm in Phase 0)

| Gate | Pass condition |
|------|----------------|
| G1 Data residency | All prompts, data and embeddings are processed and stored in approved regions/locations |
| G2 No training on our data | Contractual/technical guarantee that our data is not used to train vendor models |
| G3 Access control | AI calls respect existing RBAC/row-level security (W2/W5 permission tests pass 100%) |
| G4 Auditability | Prompts, responses and user identity are recoverable from logs for audit |
| G5 Minimum quality | Every *critical* workload reaches its minimum quality threshold on the held-out set |
| G6 SLO at expected peak | p95 latency and error rate meet the SLO at 1× peak |
| G7 Model flexibility | Can run the Track A open-weight model (managed or BYO) |

## 3. Proposed weights (NOT locked — see `config/scoring.yaml`)

| Dimension | Weight |
|-----------|-------:|
| D1 Quality | 25 |
| D4 Cost / TCO | 20 |
| D2+D3 Performance & reliability | 15 |
| D5 Security & governance (beyond the gates) | 15 |
| D6 Data integration | 10 |
| D7 Operability | 10 |
| D8 Strategic / lock-in | 5 |
| **Total** | **100** |

Within D1, workload sub-weights follow Phase 0 priorities. Track A drives the platform scores. Track B is
reported next to them and feeds D7/D6 (how good the native tooling is), but it does not double-count model quality.

## 4. Anchor scales (example — D2 latency)

| Score | p95 end-to-end latency at 1× peak vs SLO |
|------:|------------------------------------------|
| 5 | ≤ 50% of SLO |
| 4 | ≤ 75% of SLO |
| 3 | ≤ 100% of SLO (meets SLO) |
| 2 | ≤ 125% of SLO |
| 1 | ≤ 150% of SLO |
| 0 | > 150% of SLO |

Every metric has a table like this in `config/scoring.yaml`, written **before** results. Qualitative
dimensions (D5–D8) use written anchors ("3 = supported with manual configuration; 5 = supported natively, policy-as-code, audited")
and must cite evidence (doc link, test ID or screenshot) for each score.

## 5. Statistics rules

- **Paired design.** Every platform answers the same items, so compare per item (paired), not by averages alone.
- **Sample sizes (proposed).** ≥ 400 held-out items for each *critical* workload, ≥ 100 for secondary ones.
  At ~80% accuracy, 400 items gives a ~±4 pt 95% CI per platform. A smaller set can't separate platforms that are a few points apart.
- **Confidence intervals.** 95% bootstrap CIs (10,000 resamples, by item) on every quality metric and on the
  difference between each pair of platforms.
- **Significance.** McNemar's test for paired pass/fail metrics; paired bootstrap for continuous scores.
  Holm correction across multiple comparisons.
- **Ties.** If the CI of the difference includes zero, the platforms are **tied** on that metric and get the same anchor score.
- **LLM judge calibration.** Before Phase 3, ≥ 100 items per workload are graded by two humans and by the judge.
  Required: human–human agreement and human–judge agreement with Cohen's κ ≥ 0.6 (or Spearman ρ ≥ 0.7 for scales).
  If the judge fails, fix the rubric or use human grading for that workload.
- **Performance variance.** Report the median across ≥3 runs, with the min–max range. A difference smaller than the
  run-to-run range is reported as a tie.

## 6. Readout format

1. Gate results (table, with evidence links).
2. Scorecard: dimension scores ×3 platforms, weighted total, Track B side-by-side.
3. Sensitivity chart: does the ranking survive weight changes?
4. Cost curves: $ per 1k successful tasks vs. utilization for all three.
5. Effort comparison: hours spent, vendor-assisted hours shown separately.
6. Risks, caveats, and every change-log entry made after the lock.
