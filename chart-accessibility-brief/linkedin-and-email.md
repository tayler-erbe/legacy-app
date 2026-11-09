# Final drafts (November 2026)

Brief link once GitHub Pages is on: https://tayler-erbe.github.io/semantic-visualizations-for-access/brief/
Research repo: https://github.com/tayler-erbe/semantic-visualizations-for-access

---

## LinkedIn post (about 150 words)

When I built the accessibility features for our Legislative Intelligence Platform, my first version used AI to describe the charts. I ended up rebuilding it without AI.

Chart Details now calculates each description straight from the chart's data, with an accessible table and an Excel download next to it. Nothing is generated, so nothing gets made up.

Then I went through the research to check my call. Top models like GPT-5.4 and Gemini got about 1 in 5 chart numbers wrong, and handing them the data table only helped a few points. On hard chart questions, the best model scored 63%. People scored 93%. And the busier the chart, the worse the AI gets, which is exactly where screen-reader users need help most.

AI will get there. But if you already have the data, why make readers trust a guess?

Full brief and every source: https://tayler-erbe.github.io/semantic-visualizations-for-access/brief/

---

## Email to Rick Getty

**Subject:** Chart accessibility: the research behind Chart Details

Hi Rick,

Pramod mentioned you're exploring chart accessibility, so I wanted to share what I've learned building it into the Legislative Intelligence Platform.

Every chart on the platform has a Chart Details panel with a plain-language description, an accessible data table and an Excel download. None of it is AI-generated. It's calculated directly from each chart's data, so every statement can be checked against the source.

I started with AI-generated descriptions and moved away from them after looking at the research:

- GPT-5.4 and Gemini misstated about 1 in 5 chart numbers, and giving them the chart's data table helped by only a few points (2026 study, 1,224 descriptions).
- In a human check of 1,187 AI-written chart captions, 82% contained at least one factual error (2023-era models).
- On hard chart questions, the best model scored 63% while people scored 93%, and accuracy fell further as charts got busier.

I put the findings, charts and every source into a short brief: https://tayler-erbe.github.io/semantic-visualizations-for-access/brief/

The papers and an evaluation plan for testing this on our own charts are here: https://github.com/tayler-erbe/semantic-visualizations-for-access

You can explore the platform at https://legislationtrends2026-fgh8dvf0a4edhqc3.northcentralus-01.azurewebsites.net/ using your NetID-associated email; it sends a sign-in link. The Trends page has the chart visualizations, and the attached v1.1 user manual covers the accessibility features.

I'd be glad to walk you through it, or talk about using the same approach in your reporting. Just reply and we can find a time.

Best,
Tayler
