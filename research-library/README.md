# Accessible Charts Research Library

Research behind *Charts Without Guesswork* (Document Intelligence Lab, Tayler Erbe). Collected November 2026.

**Status key:** Read = read in full and numbers checked. Skimmed = abstract, results and limits checked. Filed = downloaded, not yet read.

**Licensing note:** most arXiv and ACM papers do not grant redistribution rights. Keep the `papers/` folder in a **private** repo, or publish this catalog with links only.

## 1. What blind and low-vision readers need

| Paper | Year · venue | Why it matters | Key finding | Status | File |
| --- | --- | --- | --- | --- | --- |
| Accessible Visualization via Natural Language Descriptions: A Four-Level Model of Semantic Content (Lundgard, Satyanarayan) | 2021 · IEEE VIS / TVCG | The framework for what a chart description should contain | 30 blind and 90 sighted readers. Blind readers want facts, not editorializing; 40% want descriptions that combine levels. Levels 1–2 are computable from data | Read | `papers/lundgard-satyanarayan-2021-four-level-model.pdf` |
| Understanding Screen-Reader Users' Experiences with Online Data Visualizations (Sharif et al.) | 2021 · ASSETS | The baseline harm | Screen-reader users were 61.48% less accurate and took 210.96% more time than non-screen-reader users (36 vs 36 participants) | Skimmed | `papers/sharif-assets2021-screen-reader-experiences.pdf` |
| Communicating Visualizations without Visuals: Alt Text for People with Visual Impairments (Jung et al.) | 2022 · TVCG | Evidence-based alt text guidance | Interviews with 22 people; guidelines call for chart type, axes, data points and trends; published practice only partly follows them | Skimmed | `papers/arxiv-2108.03657-jung-alt-text-for-visualizations.pdf` |
| Rich Screen Reader Experiences for Accessible Data Visualization (Zong et al.) | 2022 · EuroVis | Navigable structure, not just a paragraph | 13 blind or low-vision users; hierarchy, cursors and roadmaps help | Filed | `papers/arxiv-2205.04917-zong-rich-screen-reader-experiences.pdf` |
| Olli: An Extensible Visualization Library for Screen Reader Accessibility (Blanco et al.) | 2022 · IEEE VIS | Open-source, data-driven accessible charts | Converts charts to keyboard-navigable structures | Filed | `papers/olli-blanco-2022.pdf` |
| VoxLens: Making Online Data Visualizations Accessible (Sharif et al.) | 2022 · CHI | A data-driven tool, measured | Screen-reader users 122% more accurate and 36% faster with the tool | Filed | `papers/sharif-chi2022-voxlens.pdf` |
| Understanding and Improving Information Extraction from Online Geospatial Data Visualizations (Sharif et al.) | 2022 · ASSETS | Maps, a hard case | Follow-on to the 2021 study | Filed | `papers/sharif-assets2022.pdf` |
| MATCHA: LLM-Based Chart Summarization for Screen Reader Users (Kahn et al.) | 2026 · ACL NLP4PI | The newest LLM-for-screen-readers user study | 126 participants. Optimized LLM summaries plus Q&A raised task accuracy from 29.17% to 55.00%. Chart flaws cause "semantic drift"; their drift metric does not check facts | Skimmed | `papers/acl-nlp4pi2026-matcha-llm-chart-summaries.pdf` |
| Touching or Chatting: LLMs and Tactile Charts for BLV Chart-Type Learning (He et al.) | 2026 · arXiv / VIS | LLM help without structure is weak | 12 BLV participants; text plus LLM was weak on spatial reasoning; tactile models helped | Skimmed | `papers/arxiv-2607.23065-touching-or-chatting.pdf` |

## 2. How accurate AI is about charts

| Paper | Year · venue | Key finding | Status | File |
| --- | --- | --- | --- | --- |
| Chart-Supported or Model-Supplied? (Eliza et al.) | 2026 · arXiv | GPT-5.4, Gemini, Llama on 102 charts: ~77.5% of "direct" numbers match (pooled with and without the data table); adding the table helped 2–7 points | Read | `papers/arxiv-2607.25021-chart-supported-or-model-supplied.pdf` |
| Do LVLMs Understand Charts? CHOCOLATE (Huang et al.) | 2024 · ACL Findings | 82% of AI captions had a factual error | Read | `papers/arxiv-2312.10160-chocolate.pdf` |
| ChartMuseum (Tang et al.) | 2025 · NeurIPS | Best model 63% vs people 93%; clutter test | Read | `papers/arxiv-2505.13444-chartmuseum.pdf` |
| VisText: Semantically Rich Chart Captioning (Tang, Boggust, Satyanarayan) | 2023 · ACL (Outstanding Paper) | Captions from data tables and scene graphs; six error categories | Filed | `papers/arxiv-2307.05356-vistext.pdf` |
| Chart-to-Text (Kantharaj et al.) | 2022 · ACL | Hallucinations even with the data table | Filed | `papers/arxiv-2203.06486-chart-to-text.pdf` |
| CharXiv (Wang et al.) | 2024 · NeurIPS | Human 80.5%; easy-benchmark context | Filed | `papers/arxiv-2406.18521-charxiv.pdf` |
| ChartQAPro (Masry et al.) | 2025 · arXiv | Same model 90.5% on ChartQA, 55.8% on ChartQAPro | Filed | `papers/arxiv-2504.05506-chartqapro.pdf` |
| CaTS-Bench: Can Language Models Describe Time Series? | 2025 · arXiv | Models miss numeric nuance in trend descriptions | Filed | `papers/arxiv-2509.20823-cats-bench.pdf` |

## 3. Rules versus AI, and reliability

| Paper | Year · venue | Key finding | Status | File |
| --- | --- | --- | --- | --- |
| Differences in Semantic Errors Made by Different Types of Data-to-text Systems (Huidrom, Belz, Lorandi) | 2024 · INLG | Rule systems made fewer meaning errors than neural and LLM systems | Read | `papers/inlg2024-semantic-errors-data-to-text.pdf` |
| LLMs Corrupt Your Documents When You Delegate (Laban, Schnabel, Neville) | 2026 · Microsoft Research | Frontier models lose 25% of content over 20 edits | Read | `papers/arxiv-2604.15597-llms-corrupt-documents.pdf` |
| Don't Let AI Agents YOLO Your Files | 2026 · arXiv | Undo and inspection belong in the system, not the agent | Filed | `papers/arxiv-2604.13536-agents-yolo-files.pdf` |

## 4. For the data-readiness proposal

| Paper | Year · venue | Key finding | Status | File |
| --- | --- | --- | --- | --- |
| Semantic Layers for Reliable LLM-Powered Data Analytics | 2026 · arXiv | Semantic layer reported to add 17–23 points of first-shot accuracy | Filed | `papers/arxiv-2604.25149-semantic-layers-benchmark.pdf` |
| Pervasive Annotation Errors Break Text-to-SQL Benchmarks and Leaderboards | 2026 · arXiv | 52.8% / 62.8% annotation errors in BIRD Mini-Dev / Spider 2.0-Snow | Filed | `papers/arxiv-2601.08778-text-to-sql-annotation-errors.pdf` |

## Datasets

`datasets/four-level-model/` holds Lundgard and Satyanarayan's released corpus: 582 descriptions of 50 charts, with 2,147 sentences each labeled Level 1 to 4. It is the answer key for scoring descriptions by level. Source: https://vis.csail.mit.edu/pubs/vis-text-model/data/ (released under an open license per the paper).

## Still to get

- Chart Reader (Thompson et al., CHI 2023) and MAIDR (Seo et al., CHI 2024): ACM-hosted.
- InsightBench and DataBench (SemEval-2025 Task 8): LLM accuracy on insights and questions over real tables.
- Kim et al., "Accessible Visualization: Design Space, Opportunities, and Challenges" (EuroVis 2021).
