# LinkedIn post (draft)

While finishing the accessibility features on the Legislative Intelligence Platform, I had to decide how to make every chart usable for people who can't see it.

My first version used AI to describe the charts. It worked, but it wasn't the right answer. AI brings hosting, per-call cost, validation, abuse limits, and an error rate you have to manage forever.

So I rebuilt it. Chart Details now computes each description with rules, straight from the chart's own data, next to an accessible table and an Excel download. Nothing is generated. Every sentence can be checked against the source.

Then I went through the research to see whether that was the right call. It was:

• Even with the data table in hand, GPT-5.4 and Gemini got about 1 in 5 numbers wrong (2026 study, 1,224 descriptions).
• 82% of AI-written chart captions contained at least one factual error when people checked them (ACL 2024).
• On hard chart questions, the best model scored 63%. People scored 93% (NeurIPS 2025).
• Blind readers asked for straight facts about the data (MIT, IEEE VIS 2021), which is exactly what rules compute best.

AI may get there. But if you already have the data, why make your readers depend on a model guessing at a picture of it? Rule-based descriptions aren't hard to build, they cost almost nothing to run, and they're defensible.

Full brief and every source: [LINK]

#Accessibility #DataVisualization #AI #A11y #HigherEd

---

# Paragraph for the email to Rick

One distinction that may be useful: the Chart Details content is not AI-generated. It is calculated directly from each chart's underlying data and provides a plain-language description, an accessible data table, and an Excel download. I chose this after looking at the research. Even top 2026 models misstated about 1 in 5 numbers when given the chart's data, and an audit of AI chart captions found 82% contained at least one factual error. A rule-based description can't invent a number, and every statement can be checked against the source. I've put the findings and sources in a short brief here: [LINK]
