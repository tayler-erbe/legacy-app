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

---

## Reply-all to Mark's introduction (supersedes the standalone email to Rick)

To: Dimuthu Tilakaratne, Rick Getty · Cc: Mark McCarthy, Pramod Joshi

Hi Dimuthu and Rick,

Mark, thank you for the introduction and the kind words. It's good to be reconnected.

Dimuthu, thank you for connecting me with Keith and Jemma. I'll follow up with both, and I'd be glad to present at the Urbana Data Explorers group and the UIC data community.

Rick, Pramod mentioned you may be exploring something similar, so I wanted to share one distinction from how the platform works now. My first version did use AI to write the chart descriptions. I rebuilt it so the Chart Details content is calculated directly from each chart's underlying data, with a plain-language description, an accessible data table and an Excel download. Every statement can be traced back to the source data, and the description stays objective by design, which was Mark's main goal.

The research backed that up. Even the newest models still get a real share of chart facts wrong, handing them the data only helps a little, and they struggle most on busy charts.

AI still played a big part: it helped me build and test the rules. It just doesn't write what the reader sees. The same approach should carry over to Tableau, since the data behind each visualization is already there.

I put the findings and every source into a short brief: https://tayler-erbe.github.io/semantic-visualizations-for-access/brief/
The papers and an evaluation plan are here: https://github.com/tayler-erbe/semantic-visualizations-for-access

You can explore the Legislative Intelligence Platform at https://legislationtrends2026-fgh8dvf0a4edhqc3.northcentralus-01.azurewebsites.net/ with your NetID-associated email; it sends a sign-in link. The Trends page has the chart visualizations, and the attached v1.1 user manual covers the accessibility features.

I'd be glad to show any of you the prototype. Just reply and we can find a time.

Best,
Tayler

---

## LinkedIn post, version 2 (supersedes version 1)

When I built the accessibility features for our Legislative Intelligence Platform, my first version used AI to describe the charts. It seemed like a great option. I hooked up a fairly cheap model in Azure, fed it the chart data, and had it write the takeaways.

Testing the accessibility features showed me the problems. I ended up rebuilding it without AI entirely.

Two reasons this matters:

1. You're building in a cost for something that doesn't need one. Every view, every refresh, every call.
2. AI is very, very good right now, but there are things it's still bad at. Describing charts accurately is one of them.

I went through 22 research papers to check my call. Here's how the best models did, as of November 2026:

• GPT-5.4: 79% of the chart numbers it presented as fact matched the data
• Gemini 3.5 Flash: 80%
• Llama 4 Scout: 71%
• Gemini 2.5 Pro on hard chart questions: 63%, where people scored 93%
• 82% of AI-written chart captions had at least one factual error (older models)

A rule-based description, engineered right, can't state a number that isn't in the data. Same input, same output, every time, and every sentence can be checked against the table. In the research, rule-based systems also made fewer meaning errors than AI ones.

AI will get there. But if you already have the data, why make readers trust a guess?

Full brief and every source: https://tayler-erbe.github.io/semantic-visualizations-for-access/brief/
