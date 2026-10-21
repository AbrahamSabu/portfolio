# Kríos: market and competitive research, full report

Prepared for Heloria Labs Ltd (CRO 821585). Research conducted 9 to 10 August 2026.

Quick-look version: [SUMMARY.md](./SUMMARY.md)

---

## Contents

1. [Methodology and confidence note](#1-methodology-and-confidence-note)
2. [The industry](#2-the-industry)
   - 2.1 [The AI sales roleplay category](#21-the-ai-sales-roleplay-category)
   - 2.2 [Funding, scale and consolidation](#22-funding-scale-and-consolidation)
   - 2.3 [Where the category is heading](#23-where-the-category-is-heading)
   - 2.4 [The door-to-door and field sales industry](#24-the-door-to-door-and-field-sales-industry)
   - 2.5 [Churn and ramp economics](#25-churn-and-ramp-economics)
   - 2.6 [What training actually looks like today](#26-what-training-actually-looks-like-today)
3. [Ireland](#3-ireland)
   - 3.1 [Sizing reality check](#31-sizing-reality-check)
   - 3.2 [Solar and the SEAI grant](#32-solar-and-the-seai-grant)
   - 3.3 [Energy switching](#33-energy-switching)
   - 3.4 [Telecoms and the National Broadband Plan](#34-telecoms-and-the-national-broadband-plan)
   - 3.5 [Home improvement and retrofit](#35-home-improvement-and-retrofit)
   - 3.6 [Security and alarms](#36-security-and-alarms)
   - 3.7 [Charity face-to-face fundraising](#37-charity-face-to-face-fundraising)
   - 3.8 [Regulation: doorstep selling, GDPR and the EU AI Act](#38-regulation-doorstep-selling-gdpr-and-the-eu-ai-act)
   - 3.9 [Tailwinds and headwinds](#39-tailwinds-and-headwinds)
   - 3.10 [Is Ireland-first a beachhead or a ceiling](#310-is-ireland-first-a-beachhead-or-a-ceiling)
4. [Competitors](#4-competitors)
   - 4.1 [Camp one: AI roleplay](#41-camp-one-ai-roleplay)
   - 4.2 [Camp two: field and in-person coaching](#42-camp-two-field-and-in-person-coaching)
   - 4.3 [Camp three: D2D software the buyer already pays for](#43-camp-three-d2d-software-the-buyer-already-pays-for)
   - 4.4 [Camp four: platform incumbents](#44-camp-four-platform-incumbents)
   - 4.5 [Camp five: courses and communities](#45-camp-five-courses-and-communities)
   - 4.6 [UK and Ireland local players](#46-uk-and-ireland-local-players)
   - 4.7 [The status quo](#47-the-status-quo)
   - 4.8 [General-purpose LLMs](#48-general-purpose-llms)
   - 4.9 [Threat matrix](#49-threat-matrix)
5. [Recommendations](#5-recommendations)
   - 5.1 [Product](#51-product)
   - 5.2 [Positioning and messaging](#52-positioning-and-messaging)
   - 5.3 [Pricing and packaging](#53-pricing-and-packaging)
   - 5.4 [Go to market](#54-go-to-market)
   - 5.5 [SEO and AEO](#55-seo-and-aeo)
   - 5.6 [Moat](#56-moat)
6. [Risks and open questions](#6-risks-and-open-questions)
7. [Sources appendix](#7-sources-appendix)

---

## 1. Methodology and confidence note

Research window: 9 to 10 August 2026. All web sources were accessed on those two days.

**Three labels are used throughout, and they mean different things.**

- **Verified.** I fetched the page and read the claim in the primary or near-primary source. Example: Kendo AI's published price list on kendo.ai/pricing.
- **Reported.** The claim comes from a credible secondary source (a funding announcement, a trade publication, an analyst profile such as Sacra) but I did not see it confirmed by the company in a primary document. Example: Rilla's per-seat pricing.
- **Inference.** My reasoning from the evidence, clearly flagged. Example: the size of the Irish door-to-door rep population.

**What I could not verify.**

- **krios.ie returned HTTP 403 to automated fetching.** Everything I say about what Kríos currently claims comes from the local repository at `D:\Work\Duolingo-for-D2D\full-prod\marketing`, not from the live site. If the live site has drifted from the repo, my read of the positioning is stale.
- **Pricing for Hyperbound, Second Nature, Siro, Rilla, SalesRabbit Enterprise and Spotio is not published.** Every figure quoted for these is a third-party report, and several of those third parties are competing vendors with an incentive to make the number look bad. Treat all of them as directional only. I have said so at each point rather than once at the top.
- **Irish door-to-door rep counts do not exist as a published statistic.** The CSO Labour Force Survey publishes employment by economic sector, not by "door-to-door field sales rep". My sizing is bottom-up inference from named agencies and vertical activity, with the assumptions written out so you can argue with them.
- **G2 and Capterra category pages blocked automated fetching**, so I could not count products in the new AI Sales Roleplay category or confirm review volumes. The category's existence and its top three products are verified from G2's own announcement.
- **The Charities Institute Ireland Code of Practice for Face to Face Fundraising** sits behind a SharePoint download. I confirmed the code exists and what it broadly covers, not its clause-level contents.
- **Kríos's own product**. I skimmed `full-prod/krios-app` and `full-prod/Backend` for structure only, as instructed. Route names and screen names tell me what exists; they do not tell me how well any of it works.

**One methodological warning that matters for this specific category.** A large share of the "best AI sales roleplay tools" listicles that dominate these search results are published by vendors in the category (Kendo, Hyperbound, Mindtickle, Outdoo, Trellus, PitchMonster all publish one). They are useful as evidence of who is competing and how the category talks about itself. They are not independent evaluations, and I have not treated them as such.

---

## 2. The industry

### 2.1 The AI sales roleplay category

The category is roughly two and a half years old in its current form. Hyperbound, generally treated as the company that made AI sales roleplay a distinct product category rather than a feature, launched in January 2024 (reported, via Hyperbound's own Series A announcement).

As of mid-2026 the category is crowded. In the course of this research, the following products appeared repeatedly as named AI sales roleplay tools: Hyperbound, Second Nature, Kendo AI, Yoodli, Quantified, Luster, Mindtickle, Allego, PitchMonster, Rehearsal, FullyRamped, Outdoo, SmartWinnr, SecondBody, Eagr, Trellus, Knowlee, Rolevo, Brevity, Tough Tongue AI, UneeQ and Centrical. That is more than twenty named entrants, and the list is not exhaustive.

**This is the single most important structural fact about the category, and it cuts against Kríos.** Voice roleplay against an AI buyer is no longer scarce. It is becoming a commodity capability that many companies can ship, because the underlying components (a realtime voice model, a persona prompt, a scoring rubric) are purchasable infrastructure. Kríos's defensibility cannot rest on "we do AI voice roleplay".

The broader sales enablement platform market that this category sits inside is sized by Grand View Research at USD 5.23 billion in 2024, projected to USD 12.78 billion by 2030 at a 16.3% CAGR (verified from Grand View's report page). Other firms publish similar shapes with different absolute numbers (Fortune Business Insights: USD 6.13 billion in 2025; Precedence Research: USD 6.58 billion in 2025). The spread between firms is wide enough that any single number should be quoted with its source attached and treated as an order of magnitude, not a fact.

### 2.2 Funding, scale and consolidation

Recent, dated, verifiable funding events in and adjacent to this category:

| Company | Event | Amount | Date | Investors named |
|---|---|---|---|---|
| Hyperbound | Series A | USD 15m | 15 September 2025 | Peak XV Partners (lead), Y Combinator, Snowflake Ventures, Roble Ventures, Fellows Fund |
| Second Nature | Series B | USD 22m | October 2025 | Sienna VC (lead), Bright Pixel, StageOne, Cardumen, Signals VC, Zoom |
| Yoodli | Series B | USD 40m | December 2025 | WestBridge Capital (lead), Neotribe, Madrona |
| Siro | Series B | USD 50m | 22 May 2025 | SignalFire (lead), 01 Advisors, StepStone, CRV, Fika, Index |
| Rilla | Series B | USD 68.5m | June 2025 | Google Ventures (lead) |
| Salesloft / Clari | Merger | not disclosed | announced August 2025, completed December 2025 | n/a |

Sources and caveats are in the [appendix](#7-sources-appendix). The Rilla Series B figure and post-money are reported by Sacra, not confirmed by Rilla in a primary release I could reach.

**Two things stand out from this table.**

First, **the field coaching camp is far better capitalised than the roleplay camp.** Rilla and Siro raised USD 118.5m between them in 2025. Hyperbound and Second Nature, the two most cited roleplay pure-plays, raised USD 37m between them. The money in the in-person selling problem is going to the companies that own the real conversation, not the simulated one.

Second, **the revenue scale is not close either.** Sacra reports Rilla at USD 51m ARR in 2025 and an estimated USD 70m ARR in April 2026, up from USD 11m in 2023, with 2,000-plus accounts by mid-2025 and an average contract value around USD 20,000 per year (all reported, via Sacra). Hyperbound's Series A coverage mentions two consecutive months of adding more than USD 1m in new ARR (reported, September 2025) but no ARR total. There is no public evidence that any AI roleplay pure-play is close to Rilla's scale.

### 2.3 Where the category is heading

Three directions are visible in the evidence, and all three matter to Kríos.

**Direction one: roleplay is converging with conversation intelligence.** Rilla, which built its business on recording real in-person conversations, now sells a roleplay product at rilla.com/roleplay (verified: the page exists and is described as AI-powered sales training with roleplay practice). Hyperbound, which built its business on simulated calls, added real call scoring and custom AI scorecards (reported, via its own Series A post). Kendo AI sells both roleplay minutes and live call scoring hours in the same per-seat plan (verified from its pricing page). The two camps are collapsing into one product shape: practise, then record, then score, in one place.

**Direction two: the platforms are absorbing it.** Gong announced "Mission Andromeda" on 25 February 2026, introducing Gong Enable, an AI-powered revenue enablement solution with an AI Call Reviewer that surfaces coaching opportunities and links enablement programmes to revenue metrics (verified from Gong's own press release). Salesforce ships Agentforce Sales Coach with CRM-native roleplay, reported as bundled with Enterprise and Unlimited Sales Cloud licences rather than sold as a separate line item (reported, via third-party reviews; I could not fetch Salesforce's own page, which returned 403). G2 introduced an "AI Sales Roleplay" category in May 2026 whose top three listed products are Second Nature AI, Allego and Mindtickle (verified from G2's own announcement, published 2 June 2026). Two of those three are enablement platforms that added roleplay, not roleplay companies.

**Direction three: voice quality and latency are no longer the differentiator, price is.** ElevenLabs Agents publishes additional call minutes at USD 0.08 per minute, with LLM and telephony billed separately (verified from ElevenLabs' Agents pricing page, plan tiers from USD 0 Free to USD 990 Business). OpenAI's realtime models are reported in the same broad band once caching is applied. When the infrastructure is that cheap and that good, the moat moves away from "does the voice sound real" and towards data, distribution and workflow.

**Inference.** Within roughly 24 months, "AI voice roleplay" will be a checkbox on a sales enablement or field sales platform, not a product category anyone buys standalone, except where a vendor owns something the platforms do not: a specific vertical's data, a specific buyer's workflow, or a specific regulatory posture. That is the frame Kríos should plan against.

### 2.4 The door-to-door and field sales industry

**A warning on the numbers.** The most commonly cited "door-to-door market size" figures are actually direct selling figures from the US Direct Selling Association: USD 34.7 billion in retail sales in 2024 with 5.4 million direct sellers (reported, via DSA's 2024 Growth and Outlook fact sheet). **These are not the same industry.** DSA numbers are dominated by multi-level marketing and social selling. They tell you almost nothing about the solar, fibre, alarm and home improvement crews Kríos sells to. If you use these numbers on the site, you will be quoting a real source for the wrong thing, and a sharp buyer will notice. My recommendation is not to use them at all.

The credible sizing anchor for the actual industry is SPOTIO's **State of Field Sales 2026**, published 6 March 2026, based on 452 sales professionals of whom 388 have field sales teams, with the sample skewed to roofing and storm restoration (17%), telecom and fibre (13%) and business services (13%) (verified from SPOTIO's report page). It is a vendor survey, so it has a selection bias towards teams that already buy field sales software, and you should say so when citing it. It is still the best public dataset on this buyer that I found.

Key figures from that survey (all verified from the report page):

- 41% of teams report annual rep turnover of 50% or higher. Only 16% keep turnover below 10%.
- 40% of organisations need three months or more to fully onboard a new rep.
- Only 35% of teams have more than 70% of reps consistently hitting quota. Just 9% have 90%-plus attainment.
- Field reps spend 44% of their time on active selling.
- 33% of field sales teams use zero AI tools.
- 62% use a CRM. More than half lack territory mapping and route optimisation.
- 55% plan definite headcount growth. Only 3% plan reductions.

A companion SPOTIO article cites the same survey for "68% of field sales teams report 30% or higher annual turnover" and "56% of field sales teams ramp new reps in under three months" (verified from the article; note that the second figure is the inverse of the 40% ramp figure above and both come from the same survey).

**The three numbers that make the Kríos argument for you**: 41% at 50%-plus turnover, 40% taking three months-plus to ramp, and 33% using no AI at all. The first two are the problem. The third is the market opportunity and the adoption risk at the same time.

### 2.5 Churn and ramp economics

Widely repeated figures put D2D-specific annual attrition between 60% and 100% in high-volume organisations, and the cost to recruit, onboard, train and ramp a single D2D rep at USD 5,000 to 15,000 before first close. **I could not trace either of these to a primary study.** They appear in vendor blog posts (Sequifi, Gangly) that do not cite an underlying source. Do not use them. The SPOTIO survey figures above are sourceable and nearly as strong.

**Inference on unit economics.** If a 50-rep Irish crew replaces half its force in a year, and each replacement costs even a conservative few thousand euro in recruitment, kit, commission draw and manager time, the annual cost of churn is a five-figure to low six-figure number. That is the budget Kríos is competing for. Kríos's own `/ramp-cost-calculator` page is the right instinct. It should be driven by the buyer's own inputs rather than by any industry average, precisely because the industry averages are not sourceable.

### 2.6 What training actually looks like today

From the evidence gathered, the realistic stack in a D2D organisation today is:

1. **Morning huddle or "atomic" meeting**, where the manager runs a script drill or a peer roleplay for five to fifteen minutes.
2. **Ride-alongs**, where a manager shadows a rep for part of a day. This is the coaching gold standard and it does not scale. Rilla's entire business is built on that observation.
3. **Video courses**, typically D2D University or D2D Experts material, or a vertical-specific outfit. D2DU sells self-serve certification paths across 12 verticals plus a National Sales Call membership at USD 99 per month (reported, via D2DU's own pages).
4. **Nothing**, for most of the team, most weeks.

The 33% of field sales teams using zero AI tools (SPOTIO, March 2026) is the honest baseline. Kríos's competition in most deals is not Hyperbound. It is an unstructured huddle and a manager who is too busy.

---

## 3. Ireland

### 3.1 Sizing reality check

There is no published figure for the number of door-to-door sales reps in Ireland. Anyone who gives you one has made it up. Here is a bottom-up estimate with the assumptions exposed.

**Anchors that are real:**

- **1,841,152 private occupied dwellings** in Census 2022 (reported, via CSO Census 2022 Profile 2). That is the total door universe.
- **Uniquely**, which describes itself as the market-leading field sales outsourcing partner in the UK and Ireland, states **"250+ field sales professionals"** across both markets (verified from uniquely.ie).
- **BillSave** describes itself as Ireland's leading field sales agency, with more than 10 years running campaigns in energy, telecoms, charities and home deliveries, and has run the SSE Airtricity field sales campaign nationwide for five years (reported, via search result summary; billsave.ie returned 403 to fetching).
- **SCL Sales** ran Electric Ireland's B2B field presence in ROI and Northern Ireland from 2008 to 2021 and works with Flogas (reported, via search result summary).
- Named Irish face-to-face fundraising agencies include **We Love Fundraising**, **Trinity Group** (described as Ireland's largest face-to-face fundraising supplier) and **Emerald Fundraising**, launched in 2024 and recruiting in Dublin, Cork, Drogheda and Belfast (reported, via search result summaries).
- **345 SEAI-registered domestic solar PV companies** and 201 non-domestic (reported, via third-party directories citing SEAI's register; I did not fetch SEAI's register itself).

**Inference, with assumptions stated.** The Irish D2D and field sales population is concentrated in a small number of outsourcing agencies plus in-house crews at solar installers, alarm companies and a handful of retailers. If Uniquely's 250-plus covers UK and Ireland combined, the Irish share of that is likely in the low hundreds. Add BillSave, SCL, the three or four charity F2F agencies, in-house crews at the larger solar installers, and telecoms subcontractors, and a plausible range for people knocking doors for a living in Ireland at any one time is **roughly 1,500 to 4,000**. I want to be explicit: this is an estimate, it is not sourced, and it could be wrong by a factor of two in either direction. It should be validated by phoning ten agencies, not by desk research.

**What that implies for TAM.** At the range above, and at a realistic price of EUR 40 to 60 per seat per month (see [5.3](#53-pricing-and-packaging)), the entire Irish market at 100% penetration is roughly **EUR 0.7m to 2.9m of annual recurring revenue**. Achievable penetration in the first three years, against a status quo of doing nothing, is plausibly 5% to 15%. That is **EUR 35k to EUR 430k ARR from Ireland alone**.

That number is not a reason to abandon Ireland. It is a reason to be clear-eyed that Ireland is a proving ground, not a business.

### 3.2 Solar and the SEAI grant

This is the strongest Irish tailwind and it is genuinely strong.

- **34,088 households installed solar panels with grant aid in 2025**, up from 29,151 in 2024. 33,048 grants were awarded under the Solar PV Scheme specifically, the highest recorded, a 16% increase on 2024 and a 49% increase on 2023 (reported, via Solar Power Portal and the Irish Farmers Journal, both citing SEAI; SEAI's own end-of-year statement returned 403 to fetching).
- **More than 102,000 homes** have been grant-aided for solar since the scheme launched in 2018, with about a third of those in 2025 alone (reported, same sources).
- The **maximum grant in 2026 is EUR 1,800**, structured as EUR 700 per kWp for the first 2 kWp and EUR 200 per kWp from 2 to 4 kWp (reported, via multiple installer and comparison sites; grant rates move and should be re-checked before publication, consistent with the existing house rule in AGENT.md).
- SEAI reportedly received **more than 10,000 solar PV grant applications in the first three months of 2026, up 65% on Q1 2025** (reported, via energyefficiency.ie; this is a trade source citing SEAI rather than SEAI directly, and should be re-verified before you publish it).

**Why this matters to Kríos.** Solar is the one Irish vertical with a documented, growing, grant-driven volume of household transactions and a fragmented installer base of a few hundred registered companies. Those companies hire seasonally, sell at the door and at home shows, and have no training infrastructure. This is the beachhead inside the beachhead.

**The headwind hiding in it.** Grant-driven markets are policy-dependent. The grant has been trimmed in past years and any future reduction directly reduces installer hiring, which reduces seats. Kríos should not build a business whose revenue is a derivative of an SEAI budget line.

### 3.3 Energy switching

- In **December 2025, 37,724 electricity customers and 11,350 gas customers switched supplier**, a combined 49,074, up 38.69% and 33.42% year on year respectively (verified from the CRU's own news item, published 2 March 2026).
- In **January 2025, 33,932 electricity customers switched**, up 24.75% on December 2024 and 34.18% on January 2024 (reported, via CRU change-of-supplier coverage).

**Read.** Switching volume is healthy and growing. That is a live commercial motive for suppliers to fund acquisition channels, and door-to-door remains one of them (BillSave has run SSE Airtricity's field campaign for five years). But energy D2D in Ireland is concentrated in a handful of suppliers and a handful of agencies. That is a small number of logos, each of which is a meaningful deal. This is an enterprise-shaped sub-market inside a self-serve-shaped product.

### 3.4 Telecoms and the National Broadband Plan

- The National Broadband Plan **passed more than 500,000 premises** as of early August 2026, which is 89% of the roughly 566,000 premises in the Intervention Area (reported, via gov.ie and NBI announcements; gov.ie's release returned 403 to direct fetching so this comes from search result summaries of it).
- At contract year end on **31 January 2026, NBI had passed 451,433 premises**, a 33% year-on-year increase (reported, via NBI's own end-of-year update).
- NBI expects to complete the main build in a further 11 counties before the end of October 2026, with six counties already complete (Kilkenny, Longford, Meath, Tipperary, Waterford, Westmeath). The plan remains on track for completion by end 2026.

**This is a tailwind and a timer at once.** Passing a premises is not connecting it. Every premises passed is a door that retail ISPs now have a commercial reason to knock on, and that acquisition push typically lags the build. So there is a genuine window of fibre door-knocking in rural Ireland over the next 12 to 24 months. But the build itself finishes at the end of 2026, and once take-up matures the recurring D2D motion in that footprint shrinks. **Inference:** treat Irish fibre as a two-year opportunity, not a permanent vertical.

### 3.5 Home improvement and retrofit

SEAI's One Stop Shop scheme is the structural driver here. Between January and June 2025, an average of 550 homes per month were completed through One Stop Shops (reported, via a retrofit contractor citing SEAI data; I did not confirm this against SEAI directly and it should be re-verified).

**Read.** Retrofit in Ireland is a real and grant-supported market, but the sales motion is more often lead-generated and appointment-based than cold door-knocking, and the One Stop Shop model concentrates the customer relationship in a smaller number of larger contractors. This is a weaker D2D vertical in Ireland than solar. It is a stronger one in the UK.

### 3.6 Security and alarms

Contractors providing CCTV, access control and intruder alarm installation or maintenance in Ireland must hold a Private Security Authority licence, and operating without one is an offence. Licensing requires audit against SR40 by a PSA-approved certification body (verified from PSA and Irish Security Industry Association pages).

**Read.** The PSA licence requirement is a barrier to entry that keeps the Irish alarm installer population small and professionalised. That is bad for TAM and good for deal quality. It also means an alarm rep at the door is representing a licensed contractor with a compliance posture, which makes a training and audit trail product easier to justify. I found no evidence that PSA licensing applies to the sales function specifically, only to installation and maintenance, and that distinction should be confirmed with the PSA before it is asserted anywhere public.

### 3.7 Charity face-to-face fundraising

- Face-to-face fundraising in Ireland is self-regulated through **Charities Institute Ireland**, which publishes a **Code of Practice for Face to Face Fundraising** covering unsolicited personal approaches in public places for regular giving, and operates a **Street and Door Diary System** to manage and allocate fundraising locations (verified that both exist from Charities Institute Ireland's pages; the Code's clause-level contents sit behind a download I did not open).
- The **Charities Regulator** is the statutory regulator for charitable organisations in Ireland and publishes fundraising guidelines.
- Active Irish agencies include **We Love Fundraising**, **Trinity Group** and **Emerald Fundraising** (reported, via search result summaries).

**Read.** This is the most interesting under-served vertical for Kríos in Ireland, for four reasons. Fundraiser turnover is high and seasonal. The pitch is highly scripted and compliance-sensitive. There is an existing sector-level code that implies a training obligation. And there are only a handful of agencies, so the whole vertical is reachable with a short list of phone calls. It is small, but it is winnable and it produces reference logos with reputational weight.

### 3.8 Regulation: doorstep selling, GDPR and the EU AI Act

**Doorstep selling: Ireland has a 30-day cooling-off period, not 14.** The CCPC states that where you buy from a door-to-door salesperson and you did not arrange the visit, the cooling-off period is 30 days, against 14 days for online, mail order and phone purchases (verified from CCPC's "Changing your mind" page). Some secondary sources add a EUR 50 threshold below which the right does not apply; the CCPC page I read does not mention it, so treat the threshold as unconfirmed.

This is a genuinely useful fact and **Kríos is not currently using it.** A grep of the fifteen existing blog posts shows "cooling-off" mentioned in passing twice, with no post stating the Irish 30-day rule. It is a distinctively Irish detail that US training content gets wrong, which is exactly the content shape AGENT.md says works.

**Energy doorstep rules.** The CRU requires an energy supplier's doorstep rep to show an ID card with their name, photograph and the supplier's name and contact details, and to give the customer a copy of the doorstep checklist before the sales pitch begins. Suppliers must ensure customers are not pressurised or exploited, and must end contact when asked. These sit in the Electricity and Gas Suppliers' Handbook (verified from CRU's energy customer rights page).

**Inference and product idea.** Those are scoreable behaviours. A Kríos drill that fails a rep for pitching before presenting the checklist is a compliance artefact an Irish energy client can show a regulator. No US-built roleplay tool will ever ship that.

**GDPR.** Ireland's Data Protection Commission interprets recording exemptions narrowly, and workplace recording is governed by GDPR plus the Data Protection Act 2018 (reported, via practitioner and vendor guidance; I found no current DPC guidance page dedicated to sales call recording). **Kríos's structural advantage here is real and under-used**: a practice session involves no customer, so the practice product creates no customer personal data at all. The privacy story is stronger than Rilla's or Siro's and it is a first-order buying objection in Ireland, not a footnote.

**The EU AI Act. This is the item I think Kríos has not considered, and it cuts both ways.**

- Under **Annex III point 4(b)**, high-risk AI systems include those "intended to be used to make decisions affecting terms of work-related relationships, the promotion or termination of work-related contractual relationships, to allocate tasks based on individual behaviour or personal traits or characteristics or **to monitor and evaluate the performance and behaviour of persons** in such relationships" (verified, quoted from the AI Act Annex III text).
- **Inference:** Kríos's manager dashboard, rep scorecards, rapport scores and "who has quietly gone cold" activity tracking are, on a plain reading, systems that monitor and evaluate the performance and behaviour of workers. Whether they are *high-risk* depends on whether a deployer uses them for work-related decisions. A manager who uses a Kríos scorecard to decide who to let go has almost certainly made Kríos a high-risk deployment.
- **Timing.** The high-risk obligations were due to apply from **2 August 2026**. They have been **deferred to 2 December 2027** under the AI Act simplification package: provisional agreement 27 May 2026, European Parliament endorsement 16 June 2026, Council final approval 29 June 2026 (verified, via DLA Piper's employment law update published 30 June 2026).
- **Article 5(1)(f)** already prohibits, since **2 February 2025**, "the use of AI systems to infer emotions of a natural person in the areas of workplace and education institutions, except where the use of the AI system is intended to be put in place or into the market for medical or safety reasons" (verified, quoted from the AI Act Article 5 text).

**What this means practically.** Kríos scores an employee on "rapport". If that scoring is described as inferring the rep's emotional state, it is in dangerous territory under an already-live prohibition. If it is described as evaluating observable conversational behaviours in a simulation the rep chose to run, it is not. **The distinction is largely a matter of how the product describes what it measures, and that description is currently loose on the marketing site.** This is a cheap fix now and an expensive one later.

The deferral to December 2027 is the good news: Kríos has roughly sixteen months to get its documentation, logging and human-oversight story right before the high-risk regime bites. It is also a sales asset. An Irish or EU buyer weighing a US vendor against a Cork-based one will care that the Cork one can answer AI Act questions in writing.

### 3.9 Tailwinds and headwinds

| Factor | Direction | Confidence | Note |
|---|---|---|---|
| SEAI solar volume growing (34,088 grant-aided installs 2025) | Tailwind | High | Grant-dependent |
| ~345 registered domestic solar PV companies, fragmented | Tailwind | Medium | Many are too small to buy software |
| Energy switching up ~39% YoY (Dec 2025) | Tailwind | High | Few suppliers, few agencies |
| NBP fibre: 500,000+ premises passed, connection push ahead | Tailwind | High | Build completes end 2026, window closes |
| Charity F2F: existing code of practice, high churn | Tailwind | Medium | Very small vertical |
| PSA licensing in security | Mixed | High | Small but professional buyer base |
| 30-day cooling-off on unsolicited doorstep sales | Tailwind | High | Content and product asset, unused |
| GDPR strictness on recording | Tailwind | High | Kríos practice sessions create no customer data |
| EU AI Act Annex III worker monitoring | Headwind | High | Deferred to 2 Dec 2027, not removed |
| AI Act Art. 5(1)(f) emotion inference ban, live since Feb 2025 | Headwind | High | Language risk on "rapport" scoring |
| Irish D2D rep population small | Headwind | Medium (inference) | Caps Irish ARR in the hundreds of thousands |
| 33% of field teams use no AI at all | Mixed | High | Long sales cycle, but open field |

### 3.10 Is Ireland-first a beachhead or a ceiling

**It is a viable beachhead and an absolute ceiling, and both statements are true at once.**

The case for Ireland-first is strong on non-revenue grounds. It gives Kríos a market where the founders can physically visit every meaningful buyer, where the regulatory story (GDPR, AI Act, CRU doorstep rules, 30-day cooling-off) is a differentiator rather than a tax, where local dialect realism is a defensible product feature, and where no incumbent has bothered to localise. Rilla's and Siro's verticals and case studies are American home services. Hyperbound's buyer is a US or EMEA enterprise SDR floor. Nobody is fighting for a 30-rep solar crew in Cork.

The case against Ireland as a market is arithmetic. Even on generous assumptions, Ireland alone supports a few hundred thousand euro of ARR. **Inference:** Ireland should be treated as the design partner market and the proof-of-concept market, with the UK entered no later than 12 months after the Irish motion is repeatable. The UK has the same regulatory regime in substance (UK GDPR, doorstep cooling-off rules), the same language, an order of magnitude more field reps, and Uniquely's own "UK and Ireland" framing shows the agencies already operate across both.

**The trap to avoid:** building Ireland-specific product depth so deep that it does not travel, while a US competitor with 50x the capital ships something adequate everywhere. The Irish specificity should live in content, compliance and dialect, all of which are cheap to replicate for a new market, and not in core architecture.

---

## 4. Competitors

### 4.1 Camp one: AI roleplay

#### Hyperbound

- **What it does.** Converts an ICP description into an interactive AI buyer, then runs cold, warm, discovery, demo, gatekeeper, voicemail and post-sales roleplays. Has expanded into real call scoring, custom AI scorecards and learning modules (reported, via its Series A post and product pages).
- **ICP.** Large and mid-market companies with complex products and sales teams in the hundreds or thousands (reported, via Forbes, 15 September 2025). Named customers reported include Autodesk, Monday.com, Bloomberg, G2, Vanta, Airwallex and Hub International.
- **Pricing.** **Not published.** hyperbound.ai/pricing returned 403 to fetching. Third-party sources report roughly USD 24 to 69 per seat per month depending on tier, and enterprise from around USD 15,000 per year. Treat all of these as unconfirmed reports, not prices.
- **Funding.** USD 15m Series A, 15 September 2025, led by Peak XV Partners. Total reported USD 18m-plus.
- **Strengths.** Category-defining brand. Genuinely large enterprise logos. AI buyer personas reported as trained on 2m-plus hours of real B2B sales conversations, which is a real data moat for inside sales.
- **Weaknesses relative to Kríos.** It is inside-sales native. Third-party reviews note the lack of avatars limits its use for training face-to-face conversations. There is no evidence of any door-to-door product, page or customer.
- **Threat to Kríos: LOW-MEDIUM.** Not competing for the same buyer today. The threat is that it moves down-market and out to field, which its capital allows.

#### Second Nature

- **What it does.** Builds a data model of a company's sales and service playbook from recorded calls, collateral and scripts, then generates a library of AI roleplays. Reported to use 3D animated avatars simulating a face-to-face video call.
- **ICP.** Enterprise sales and service teams. Named clients include Zoom, Oracle and Adobe (reported).
- **Pricing.** **Not published.** Third parties report roughly USD 30 to 40 per seat per month with annual contract minimums around USD 20,000 and a two-month implementation. Unconfirmed.
- **Funding.** USD 22m Series B, October 2025, led by Sienna VC. Total outside funding reported at more than USD 37m.
- **Strengths.** The avatar approach is the closest any inside-sales-camp product comes to a face-to-face simulation. Listed as the number one product in G2's new AI Sales Roleplay category (verified from G2's announcement).
- **Weaknesses.** Enterprise implementation cycle and contract minimums put it structurally out of reach of a 20-rep Irish solar crew.
- **Threat to Kríos: LOW.** Different buyer, different price point, different sales cycle. It is a threat to Kríos's search rankings, not to its pipeline.

#### Kendo AI

- **What it does.** AI roleplay plus live call scoring plus sales manager features, sold together.
- **Pricing. Published, and this is unusual in the category.** Free trial at USD 0; **Pro at USD 55 per seat per month** including 180 roleplay minutes and 25 hours of live call scoring; **Max at USD 100 per seat per month** including 480 minutes and 100 hours; Enterprise custom (verified from kendo.ai/pricing). Additional usage reported at USD 0.33 per minute.
- **Strengths.** Price transparency is a real competitive weapon in a category where nobody else publishes. Kendo is also running the comparison-page SEO playbook aggressively, which Kríos's own SEO-PLAN already notes.
- **Weaknesses.** No mention of field or door-to-door anywhere on its pricing page. Smaller than Hyperbound or Second Nature on visible signals.
- **Threat to Kríos: MEDIUM.** Not for the same buyer, but Kendo is the direct competitor for the search queries Kríos is trying to win, and its published pricing sets a public anchor that Kríos's "custom" page has to beat on trust.

#### Yoodli

- **What it does.** AI roleplay across sales calls, leadership coaching, interviews and feedback, with instant personalised feedback. Broader communication coaching than pure sales.
- **Pricing.** **Partially published.** Pro at USD 8 per month billed annually for individuals, including up to 10 roleplays per week. Team and Enterprise are quote-based (reported, via Yoodli's pricing page summary).
- **Funding.** USD 40m Series B, December 2025, led by WestBridge Capital, with reported 900% revenue growth. Nearly USD 60m raised to date.
- **Strengths.** By far the strongest self-serve motion in the category and the lowest published entry price. Enormous funding relative to the roleplay pure-plays.
- **Weaknesses.** Generalist. Not a field sales product.
- **Threat to Kríos: MEDIUM.** The USD 8 per month individual tier is the price a sceptical Irish sales manager will find first and use to argue Kríos is expensive. Kríos needs an answer to it that is not "we are more expensive because we are better".

#### Quantified.ai

- **What it does.** Enterprise AI simulations validating sales readiness, with custom rubrics, certification and compliance scoring.
- **ICP.** Life sciences, medical devices, financial services, insurance and other regulated industries.
- **Pricing.** Reported at USD 60 to 85 per user per month via TrustRadius-derived third-party summaries, with contracts usually starting at 50-plus users on annual terms. Unconfirmed.
- **Threat to Kríos: LOW.** Different world entirely. Worth watching only because its compliance-and-certification framing is the one Kríos should borrow for regulated Irish verticals.

#### Luster, and the long tail

Luster's stated differentiator is a predictive layer connecting roleplay performance and live-call signals to forecast where a rep will struggle, then prescribing targeted practice (reported). Pricing not published.

Beyond Luster, the tail includes PitchMonster, Rehearsal, FullyRamped, Outdoo, SmartWinnr, SecondBody, Eagr, Trellus, Knowlee, Rolevo, Brevity, Tough Tongue AI, UneeQ and Centrical, which announced AI role-play simulations and coaching for frontline readiness on 20 January 2026.

**Threat from the tail: LOW individually, HIGH collectively.** No single one of these threatens Kríos. Together they prove the point that voice roleplay is not scarce, they saturate the search results Kríos wants, and they compress the price a buyer expects to pay.

### 4.2 Camp two: field and in-person coaching

**This is where the real threat lives, and Kríos's public framing of this camp is now out of date in one important respect.**

#### Rilla

- **What it does.** Reps record in-person sales conversations on a mobile app. AI transcribes and analyses them, and managers review condensed clips instead of doing physical ride-alongs. Rilla Live added real-time coaching in September 2025; Rilla Intelligence added company-level analytics in October 2025 (reported, via Sacra).
- **And it now sells roleplay.** **rilla.com/roleplay exists** (verified: I fetched it). It is described as AI-powered sales training with roleplay practice, framed around "Sales is a sport. Coach your people like athletes." Third-party summaries describe the module as letting reps practise against an AI simulation of a customer before actual appointments. There is a public keynote video titled "Rilla Roleplay Full Keynote: AI Roleplay For Sales Reps". I could not establish the launch date or feature depth: the roleplay page itself is a demo-request landing page with little product detail, and YouTube metadata was not retrievable.
- **ICP.** Originally home services contractors of USD 5m to 50m revenue with 5 to 50 field reps, now expanding into home building, dental, retail and enterprise, with Home Depot announced January 2026 (reported, via Sacra). Verticals on its own site: home building, home service, home remodelling, automotive, dental, senior living, multifamily.
- **Pricing.** **Not published.** Sacra reports approximately **USD 4,000 to 5,000 per seat per year with a five-seat minimum**, so roughly a USD 20,000 annual floor, annual contracts paid upfront with a 3% renewal escalator, and an average contract value around USD 20,000. Reported, not confirmed.
- **Scale.** Reported ARR of USD 11m (2023), USD 24m (2024), USD 51m (2025), estimated USD 70m (April 2026). 2,000-plus accounts by mid-2025. Gross margins estimated 85 to 90%, with speech-to-text and inference costs reported "well under USD 1 per appointment". USD 68.5m Series B in June 2025 led by Google Ventures at a reported post-money around USD 757m.
- **Strengths.** Enormous head start, real revenue, a dataset of in-person sales conversations that nobody else has at that scale, and a coaching workflow field managers already believe in.
- **Honest weaknesses.** Siro's comparison page claims 60-plus Rilla customers switched to Siro in the past year and characterises Rilla as flagging everything that went wrong on every call so that feedback becomes noise, and as becoming "shelfware: a manager's tool that feels like Big Brother to the sellers" (verified as Siro's claim; it is a competitor's marketing and should be treated as such). Recording real customers also carries genuine consent friction, which Sacra notes explicitly for two-party consent US states and which is sharper again under Irish and EU GDPR.
- **Threat to Kríos: HIGH.** This is the most direct threat in the report. Rilla owns the field coaching budget, has the field sales manager's ear, and now sells the thing Kríos sells as an add-on to a product the buyer already has.

**What this means for Kríos's messaging.** The `/compare/rilla-alternative` page already concedes that Rilla has "practice scenarios available alongside that as of July 2026", which is honest and correct. But the top-line framing in SEO-PLAN.md and AGENT.md, that the field coaching camp is "retrospective, the rep still practises on a real customer", is no longer strictly accurate and a well-informed buyer will catch it. The defensible version of the claim is narrower and still true: **Rilla's roleplay is an add-on to a recording product priced for established US home services contractors, built without doorstep-specific scenarios, Irish context, or a price a 20-rep Irish crew can sign.** Say that instead.

#### Siro

- **What it does.** Mobile app recording of in-person sales conversations, AI transcription and analysis, plus "Halftime" mid-appointment AI coaching and "Debrief" post-appointment automated calls, and Team Coaching and Self-Coaching modules.
- **And it explicitly targets door-to-door.** **siro.ai/solutions/industry/door-to-door exists** (verified: I fetched it). Siro's Series B release names "door-to-door roofers, home security reps, solar installers" as its market (verified, PR Newswire, 22 May 2025).
- **ICP.** Verticals listed on site: dealerships, home improvement, home services, home builders, telecom, multifamily, senior living, medical aesthetics, medical devices. Named customers include Culligan, American Standard, Jacuzzi, Berman Auto Group and Hello Garage, with claims such as 17% increase in units sold, 21% increase in close rate, and 80% of sales reps choosing to receive AI coaching daily. These are Siro's own customer claims, undated on the page.
- **Pricing.** **Not published.** Siro reportedly confirms a per-licence model with no usage caps and no enterprise minimums but does not disclose the licence cost. Third-party estimates range from USD 200 to 350 per rep per month with 5 to 10 user minimums, up to USD 3,000-plus per user annually. **One of those estimates comes from SalesAsk, a competing vendor.** Treat all as unconfirmed.
- **Funding.** USD 50m Series B, 22 May 2025, led by SignalFire. Founded 2020.
- **Strengths.** Explicitly positioned on in-person and door-to-door. Claims a 97% licence utilisation rate for 2026 against a stated 68% top-quartile SaaS benchmark. Rep-friendly framing (self-coaching, not surveillance) which is exactly the adoption objection Rilla is accused of losing on.
- **Weaknesses.** Still fundamentally a recording product: the learning still happens on a live customer. No practice-before-the-knock product visible. No Irish or European localisation visible. Its own Rilla comparison page does not mention door-to-door at all, which suggests the D2D page is a demand-capture landing page rather than the centre of the business.
- **Threat to Kríos: HIGH.** Siro is the competitor whose positioning language most overlaps with Kríos's own, in the same vertical list, with USD 50m behind it.

**A correction Kríos should absorb.** The claimed gap in the internal market table, that field coaching tools do not own the doorstep, is wrong as a matter of marketing territory. Siro has claimed the doorstep in its copy and its URLs. The gap that remains is real but narrower: **neither Rilla nor Siro lets a rep fail safely before the knock, and neither has localised for Ireland.**

### 4.3 Camp three: D2D software the buyer already pays for

**This is the biggest displacement risk in the report and it deserves to be named explicitly.** The Irish or UK D2D manager already pays for one canvassing platform per rep. Every euro Kríos asks for is incremental. If the canvassing platform ships adequate roleplay, Kríos's line item disappears, not because Kríos is worse but because it is a second invoice.

#### SalesRabbit

- **Pricing is published, which makes it the clearest anchor in this section.** Team at USD 59 per user per month; Pro at USD 75 monthly or USD 49 per month billed annually; Enterprise on request; RoofLink Pro at USD 120 per user per month. Add-ons: DataGrid AI at USD 19 per user per month billed annually, Weather at USD 19, Digital Contracts at USD 13, Mover Leads at USD 13 (all verified from salesrabbit.com/pricing).
- **Training posture.** SalesRabbit has a **Learn** module described as an online training system with content from industry professionals, and **Amplify Coaching** listed as an Enterprise feature with no published price (verified that both are referenced; I found no evidence of an AI voice roleplay feature). SalesRabbit Amplify, launched June 2024, is gamification and analytics, not roleplay.
- **Threat to Kríos: MEDIUM today, HIGH if they ship roleplay.** They already have the seat, the training tab and an add-on pricing model that would absorb a roleplay module at USD 19 per user per month without blinking.

#### SPOTIO

- **Pricing not published on its own site.** Third parties report entry from USD 39 per user per month and a Pro tier around USD 129, with B2C, B2B and Custom plans all requiring contact with sales. Unconfirmed.
- Publishes the State of Field Sales survey, which is a serious content asset and shows they understand this buyer better than any AI roleplay vendor does.
- **Threat: MEDIUM.** No roleplay product found. Strong content and category authority.

#### Sunbase, Knockbase, Enzy, LeadPerfection

- **Sunbase** is reported at USD 59 per user per month, modular solar CRM and field operations.
- **Knockbase** publishes content anticipating AI coaching for reps on the go, including real-time voice assistance during a pitch (reported, from its own blog). That is a stated direction of travel, not a shipped product.
- **Enzy** publishes no pricing that I could find, including on its G2 pricing page.
- **LeadPerfection** I could not research meaningfully in the time available; it appears to be a home improvement lead and CRM system rather than a canvassing app. **Open question for a human.**
- **Threat: MEDIUM collectively.** None of them has roleplay today. All of them could add it, and Knockbase is writing blog posts about doing so.

**The strategic implication.** Kríos should decide now whether these companies are competitors or channel. An integration and referral relationship with one Irish or UK-relevant canvassing platform would be worth more than out-competing all of them.

### 4.4 Camp four: platform incumbents

- **Salesforce Agentforce Sales Coach.** CRM-native roleplay with scenarios built from Salesforce data, post-roleplay scoring and feedback, reported as bundled with Enterprise and Unlimited Sales Cloud licences. Reported, not verified: salesforce.com returned 403.
- **Gong.** Launched Mission Andromeda on 25 February 2026, introducing **Gong Enable**, an AI-powered revenue enablement solution unifying coaching and training across the revenue stack, with an AI Call Reviewer and initiative tracking linking enablement to win rates, deal size and ramp time (verified from Gong's own press release).
- **Mindtickle and Allego.** Both listed by G2 in the top three of the new AI Sales Roleplay category alongside Second Nature (verified from G2's announcement). Both are enablement platforms that added roleplay.
- **Salesloft and Clari** merged: announced August 2025, completed December 2025 (reported).
- **Threat to Kríos directly: LOW.** None of these will sell to a Cork solar crew.
- **Threat to Kríos's category thesis: HIGH.** They are the proof that roleplay is becoming a feature of something larger. Any investor or acquirer will ask about this.

### 4.5 Camp five: courses and communities

- **D2D Experts / D2D University**, founded by Sam Taggart. D2DU covers 12 verticals (roofing, pest control, solar, windows, alarms, fibre, lighting, HVAC, insurance, real estate, water treatment, window cleaning) with self-serve certification paths plus a **National Sales Call membership at USD 99 per month** (reported, via D2DU's own pages).
- **D2DCon**, hosted by D2D Experts, expects **2,800-plus door-to-door professionals**, next running **28 to 30 January 2027 in Utah** (verified from d2dcon.com). D2DCon 2026 ran 22 to 24 January 2026 at the Mountain America Expo Center, Sandy, Utah.
- **Knockstar University** and various roofing and solar-specific training outfits complete the picture.
- **Threat to Kríos: LOW as competitors, HIGH as channel.** These are not products a buyer chooses instead of Kríos. They are where the buyer already is. The USD 99 per month D2DU price is also a useful anchor: it establishes that a D2D organisation will pay roughly USD 100 per month for training content with no practice and no feedback.

### 4.6 UK and Ireland local players

I found **no UK or Ireland-based AI sales roleplay or field coaching vendor** targeting door-to-door teams. The nearest adjacent players are the field sales outsourcing agencies themselves, which do their own training in-house:

- **Uniquely** (uniquely.ie and weareuniquely.co.uk): "250+ field sales professionals", 20-plus years, telecoms, energy, financial services and retail, with "in-depth induction and development training programmes delivered by our very own highly qualified trainers", and a stated ability to scale and go live within six weeks (verified from uniquely.ie).
- **BillSave**: Ireland's leading field sales agency by its own description, energy, telecoms, charities and home deliveries, SSE Airtricity's nationwide field campaign for five years (reported; billsave.ie blocked fetching).
- **SCL Sales**: Electric Ireland B2B field presence 2008 to 2021, Flogas (reported).

**This is the single clearest white space in the report.** There is no local competitor. It also tells you that the in-house trainer at an agency like Uniquely is simultaneously Kríos's best champion and its incumbent competitor, because Kríos automates part of that person's job. **Inference:** sell to the agency's commercial director on ramp speed and consistency, not to the trainer on efficiency.

### 4.7 The status quo

**Treat this as the market leader, because it is.** 33% of field sales teams use zero AI tools (SPOTIO, March 2026). The default is a huddle, a ride-along when the manager has time, and a video course nobody finishes.

**The honest case for the status quo, which Kríos should concede in writing:**

- It is free at the margin.
- Peer roleplay in a morning huddle has social accountability that a solo app session does not.
- A ride-along gives the manager information about the territory, the product and the competition, not just about the rep.
- It requires no procurement, no data protection review and no new login.

**How Kríos beats it on the buyer's own terms.** Not on quality of coaching, where a good manager beats any AI. On three things the status quo structurally cannot do:

1. **Coverage.** A manager can ride along with two reps a day. Every rep can practise every day.
2. **Evidence.** After a huddle, the manager knows who talked. After a week of Kríos, the manager knows who actually practised and which objection the floor is losing.
3. **Cost of failure.** A rep learning the "already sorted" objection on live doors is paying tuition in lost deals in a real territory. In practice the same failure costs a minute.

That third point is the strongest argument Kríos has and it is already well expressed in the existing comparison pages.

### 4.8 General-purpose LLMs

**A manager can get a usable voice roleplay out of ChatGPT for free, and Kríos should say so on the site rather than pretend otherwise.** The published guidance for doing it is mature: a master prompt describing product, persona and scenario; voice mode to force conversational speed; fifteen to twenty minute time-boxed sessions.

**The honest concessions:**

- For a single rep who is self-motivated, ChatGPT voice mode is genuinely good enough to practise objection handling.
- It costs nothing incremental if the manager already has a subscription.
- It is infinitely flexible.

**The honest rebuttals, in order of strength:**

1. **It does not persist.** There is no record that the rep practised, no trend, no scorecard, nothing for the manager to act on. The manager problem Kríos solves is a visibility problem, and a chatbot has no answer to it at all.
2. **It is too agreeable.** A general assistant will let a rep win. A prospect persona that actually closes the door has to be built to resist, and the resistance has to be calibrated, not random.
3. **Nobody sets it up twice.** Every rep would need to paste a master prompt, every time, for every scenario. In practice the drop-off is total. This is an adoption argument, not a capability argument, and it is the true one.
4. **It has no company context.** No walk list, no real objections from the pipeline, no local dialect, no compliance checklist.

**Threat: MEDIUM-HIGH, and rising.** It is not a threat to the deal with a 30-rep crew. It is a fatal threat to any self-serve individual-rep tier Kríos might build, and it caps what an individual rep will ever pay.

### 4.9 Threat matrix

| Competitor | Camp | ICP | Price signal | Threat |
|---|---|---|---|---|
| Rilla | Field coaching, now with roleplay | US home services, 5 to 50 field reps | Not published; reported ~USD 4,000 to 5,000 per seat per year, 5 seat minimum | **High** |
| Siro | Field coaching, explicit D2D page | In-person sales, home improvement, telecom, D2D | Not published; third-party estimates USD 200 to 350 per rep per month | **High** |
| SalesRabbit | D2D software incumbent | D2D and canvassing teams | Published: USD 49 to 75 per user per month, add-ons USD 13 to 19 | **Medium**, High if roleplay ships |
| Status quo | Nothing | Everyone | Free | **High** |
| ChatGPT voice | General LLM | Individual reps and managers | Effectively free | **Medium-High** |
| Kendo AI | AI roleplay | Inside sales, hiring managers | Published: USD 55 and USD 100 per seat per month | **Medium** (SEO and price anchoring) |
| Yoodli | AI roleplay, generalist | Individuals and enterprise | Published: USD 8 per month individual | **Medium** (price anchoring) |
| Hyperbound | AI roleplay | Mid-market and enterprise inside sales | Not published; reported USD 24 to 69 per seat per month | **Low-Medium** |
| SPOTIO | D2D software incumbent | Field sales teams | Not published; reported from USD 39 per user per month | **Medium** |
| Sunbase / Knockbase / Enzy | D2D software incumbents | Solar and roofing canvassers | Sunbase reported USD 59 per user per month | **Medium** |
| Second Nature | AI roleplay | Enterprise | Not published; reported USD 30 to 40 per seat per month, ~USD 20k minimum | **Low** |
| Gong Enable / Salesforce / Mindtickle / Allego | Platform incumbents | Enterprise revenue teams | Bundled | **Low** direct, **High** to the category thesis |
| Quantified / Luster / long tail | AI roleplay | Various | Mostly not published | **Low** individually |
| D2DU / D2D Experts | Courses | US D2D | Published: USD 99 per month membership | **Low** as competitor, **High** as channel |
| Uniquely / BillSave / SCL | Agencies with in-house training | Their own reps | n/a | **Low** as competitor, they are the buyer |

---

## 5. Recommendations

Each recommendation carries a rough **effort** (S, M, L) and **impact** (low, medium, high) and the reasoning behind it.

### 5.1 Product

**P1. Ship the doorstep primitives no inside-sales tool can copy. Effort M. Impact high.**
Today the app's differentiation from Hyperbound is mostly persona prompting and locale hints. The genuinely uncopyable features are physical and contextual:
- **The door close as a scored event.** A prospect who ends the conversation at second eight is the defining failure mode of D2D and has no analogue in a scheduled call. Score "seconds held" and "did you get past the threshold" as first-class metrics, not sub-scores of rapport.
- **Time of day and weather context.** SalesRabbit sells Weather as a USD 19 per user per month add-on, which tells you field teams pay for it. A 7pm midweek door in February is a different conversation from a Saturday morning in June. Personas should be seeded from it.
- **Territory and walk-list context.** The backend already has `/d2d/import-walklist`. Use it harder: an estate that has been knocked three times this month should produce a colder persona.
- **The second knock.** Callbacks and "come back when himself is home" are core D2D motions with no inside-sales equivalent.

**P2. Fix Irish voice realism, which is currently text-only. Effort M. Impact high.**
`Backend/locale_hints.py` is well built, but its own docstring says "the TTS voice stays as-is". An Irish rep practising against an American-accented householder who says "grand" is uncanny, and uncanny kills adoption in week one. Irish and regional UK voices are the most credible product reason a buyer in Cork chooses Kríos over a US tool. This is the highest-leverage single product change in the report.

**P3. Mobile-first, in-van, low-signal practice. Effort L. Impact high.**
The app is a React web app with `PhoneSession` and `VideoSession` screens. Reps practise in a van between streets, on mobile data, in bad coverage. A degraded-network mode, a genuinely mobile-native session UI and a five-minute "one door before you start" drill are what make practice a daily habit rather than an onboarding task. Rilla and Siro are mobile-native by construction because a rep records on a phone. Kríos cannot afford to be the desktop option in a category defined by people who are outdoors.

**P4. Ship a compliance drill mode. Effort S. Impact medium-high.**
CRU requires the ID card and the doorstep checklist before the pitch. Ireland has a 30-day cooling-off on unsolicited doorstep sales. Charities Institute Ireland has a face-to-face code. A drill that fails a rep for pitching before presenting the checklist, and a manager-facing report showing the floor's compliance pass rate, is an artefact an Irish energy or charity client can put in front of a regulator. **No US-built tool will ever ship this**, and it converts a regulatory headwind into a product feature.

**P5. Decide what the video capture and Recall.ai path is for. Effort S (decision). Impact medium.**
The backend has `recall.py`, `video_capture.sql`, `/video/send-bot` and calendar OAuth. That is a meeting-bot capability, which is an inside-sales feature. It is either a deliberate wedge into a second market or it is scope that dilutes the doorstep story. Pick one and say so internally. **Inference: it dilutes.** The most credible version of Kríos is monomaniacal about the door.

**P6. Team-level social mechanics, not just individual leaderboards. Effort S. Impact medium.**
Leaderboards and challenges exist. The status quo's advantage is social accountability in the huddle. A "morning huddle mode" where a manager runs a shared five-minute drill with the whole floor, results appearing live, attacks the status quo where it is strongest rather than where it is weakest.

### 5.2 Positioning and messaging

**M1. Update the three-camp table. It is now inaccurate and a good buyer will catch it. Effort S. Impact high.**
Both `AGENT.md` and `SEO-PLAN.md` state that field coaching tools leave the doorstep gap. Siro has a door-to-door landing page. Rilla sells a roleplay module. The claim as written is falsifiable in one Google search, which is corrosive on a site whose whole editorial pitch is that it concedes the honest case. The replacement claim is narrower and survives scrutiny:

> Rilla and Siro coach the conversation your rep already had, and both now offer some practice alongside it. Neither is built around the doorstep specifically, neither is priced for a twenty-rep Irish crew, and neither has localised for Ireland. Kríos is rehearsal for the doorstep, before the knock.

**M2. Lead with the manager's visibility problem, not the rep's practice problem. Effort S. Impact high.**
The buyer is the manager or the commercial director. The rep is the user. Current site hierarchy leads with what the rep does. The economic argument that closes the deal is ramp time and turnover cost, and SPOTIO's March 2026 survey gives citable numbers for both. `/for-managers` should arguably be the homepage.

**M3. Address ChatGPT head-on with a page. Effort S. Impact medium-high.**
Every manager who is technical enough to consider Kríos has already thought "can't I just use ChatGPT". A `/compare/chatgpt-sales-roleplay` page that concedes ChatGPT is genuinely good for a self-motivated individual rep, and then makes the persistence, calibration and adoption arguments, is both the honest thing and a strong search play against a query nobody in the category is answering well.

**M4. Fix the credibility gap around founder age deliberately rather than avoiding it. Effort S. Impact medium.**
ThinkBusiness reported on 16 July 2026 that the founders are 17, 17 and 18, and that the product came out of selling door to door in the Student Enterprise Programme. That is public. Buyers will find it. Handled badly it reads as a school project. Handled well, "we built this because we were the ones getting doors slammed on us" is the most credible origin story in the category, and it is more authentic than anything Hyperbound can claim. Put it on `/about` and own it.

**M5. Retire or substantiate unattributed numeric claims on the site. Effort S. Impact medium.**
The `for-teams` and `features` copy is largely qualitative, which is good, but claims like "live in an afternoon" and "no six-week implementation" are competitive assertions about Second Nature's implementation cycle. Either source them or soften them, per your own rule 4.

### 5.3 Pricing and packaging

**Published anchors, for reference:**

| Product | Price | Status |
|---|---|---|
| Yoodli Pro (individual) | USD 8 per month annual | Published |
| SalesRabbit Pro | USD 49 per user per month annual | Published |
| Kendo Pro | USD 55 per seat per month, 180 roleplay minutes | Published |
| Sunbase | USD 59 per user per month | Reported |
| SalesRabbit Team | USD 59 per user per month | Published |
| Kendo Max | USD 100 per seat per month, 480 minutes | Published |
| D2DU National Sales Call | USD 99 per month | Reported |
| Siro | USD 200 to 350 per rep per month (estimates) | Not published |
| Rilla | ~USD 333 to 416 per seat per month (USD 4 to 5k per year) | Not published |

**PR1. The removed EUR 20 per seat price was almost certainly below variable cost. Do not reinstate anything like it. Effort S. Impact high.**
ElevenLabs Agents charges USD 0.08 per additional call minute with LLM billed separately (verified). At fifteen minutes of practice per working day, a single rep consumes roughly 300 minutes a month, which is roughly USD 24 of voice alone before any LLM, transcription or infrastructure cost. Kendo's published economics tell the same story from the other side: USD 55 buys 180 minutes, about USD 0.31 per minute retail against roughly USD 0.08 to 0.12 of cost. **Any Kríos price must be built on an explicit minutes allowance, or heavy users will be unprofitable and light users will be overcharged.**

**PR2. Anchor to the field camp, not the inside-sales camp. Effort S. Impact high.**
This is the most valuable pricing insight in the report. Field sales buyers reportedly pay Rilla USD 4,000 to 5,000 per seat per year. Inside sales buyers pay Kendo USD 660 per seat per year. **Kríos has been thinking about itself as a cheaper Hyperbound when its buyer is a Rilla buyer.** Even at a fraction of Rilla's price, there is far more room than EUR 20 per seat suggests.

**PR3. A plausible ladder. Effort S to define, M to implement. Impact high. This is a proposal and an inference, not a recommendation with evidence behind the exact numbers.**

- **Crew: EUR 45 per seat per month, billed annually, five-seat minimum, 150 practice minutes per seat per month pooled across the team.** Includes drills, skill path, rep debriefs.
- **Floor: EUR 75 per seat per month, 400 minutes pooled.** Adds manager dashboard, assignments, leaderboards, objection analytics, team report export.
- **Enterprise / agency: custom.** CRM and walk-list integration, SSO, DPA, compliance drill packs, AI Act documentation, multi-team roll-ups. This is where BillSave, Uniquely and the charity agencies land.
- **Manager pilot: EUR 199 per month for one manager and up to five reps for 90 days**, credited against an annual contract. This attacks the real blocker, which is not price but risk.
- **No individual rep tier.** ChatGPT wins that fight and it teaches the market the wrong price.

Pooled minutes matter: in a 20-rep crew, three reps will do 80% of the practice, and per-seat allowances would either strand capacity or punish the keen.

**PR4. Custom-only pricing is hurting at this stage. Effort S. Impact medium-high.**
The argument for custom pricing is that it protects deal value with enterprise buyers. Kríos does not have enterprise buyers yet. What it has is a discovery problem, and Kendo has shown that publishing a price in this category is a differentiator. A D2D manager evaluating options at 9pm will bounce off a "book a demo" pricing page. Publishing Crew and Floor with "Enterprise: talk to us" gets the best of both.

### 5.4 Go to market

**G1. Sell to the contracting company and the sales agency differently, because they buy differently. Effort S. Impact high.**

- **The contracting company** (a solar installer, an alarm company, an energy supplier) buys **outcome and compliance**. Its reps may be subcontracted. Its fear is mis-selling, cancellations inside the 30-day cooling-off window, and brand damage. Sell audit trail, consistency of message and compliance drills. Longer cycle, higher value, stickier.
- **The sales agency** (BillSave, Uniquely, a charity F2F agency) buys **ramp speed and margin**. Its whole P&L is the gap between what the client pays per acquisition and what it costs to recruit, train and run a rep. Uniquely says it can go live within six weeks; anything that shortens that is directly monetisable. Shorter cycle, seat volume, and it churns when a campaign ends.

**Inference: start with agencies.** There are fewer of them, they are reachable by phone from Cork this week, they have concentrated seat counts, and the ROI argument is arithmetic rather than aspirational. Then use those logos to reach the contracting companies who commission them.

**G2. Ten phone calls beat ten thousand words of content this quarter. Effort S. Impact high.**
The named Irish targets are already identified in this report: BillSave, Uniquely, SCL Sales, We Love Fundraising, Trinity Group, Emerald Fundraising, plus the larger names on SEAI's registered domestic solar PV contractor list. That is a target list of perhaps forty organisations that covers most of the Irish market. It can be worked exhaustively by three founders in a month.

**G3. D2DCon, 28 to 30 January 2027, Utah, 2,800-plus attendees. Effort M. Impact medium.**
This is the single densest gathering of the buyer in the world, and it is six months away. It is also American, which is the market Kríos says it wants next. The decision to make now is whether the US is a 2027 or a 2029 market, because that determines whether the flight is worth it. **Inference: attend as an attendee first, not a vendor.** Learn what the American crews actually complain about before paying for a stand.

**G4. Channel through the canvassing platforms rather than around them. Effort M. Impact high.**
An integration with SalesRabbit or SPOTIO, where a rep's walk list produces practice doors, turns the biggest displacement risk into a distribution partner. Both have partner ecosystems. This is a better use of six months than out-marketing them.

**G5. Where the reps actually are. Effort S ongoing. Impact medium.**
Facebook and WhatsApp rep groups, the D2D Experts community, and the subcontractor networks around Irish solar installers. AGENT.md and SEO-PLAN.md are right that these communities matter and right that astroturfing them is a mistake. The honest version is that the founders are actual former door-knockers, which is a licence to participate that most vendors do not have.

**G6. The energy and solar installer channel. Effort M. Impact medium.**
SEAI-registered installers are a defined, listed population of a few hundred companies. A partnership with an industry body or a One Stop Shop network reaches many of them at once.

### 5.5 SEO and AEO

The existing `SEO-PLAN.md` is genuinely good and I am not going to repeat it. Here is what this research adds.

**S1. Claim the G2 "AI Sales Roleplay" category now. Effort S. Impact high. This is time-sensitive.**
G2 introduced the AI Sales Roleplay category in May 2026, announced 2 June 2026, with Second Nature, Allego and Mindtickle as its top three. New G2 categories start thin. A vendor that claims a profile and gathers a handful of genuine reviews in the first year of a category can rank in it in a way that will be impossible in three years. The existing SEO plan already lists claiming G2 as the highest-leverage single action; this finding raises its urgency and tells you exactly which category to request. Kríos should also seek the **field sales software** and **sales coaching** categories, because that is where its actual buyer browses.

**S2. Own the query nobody is answering: door-to-door specific roleplay. Effort M. Impact high.**
Searching for the best AI roleplay for door-to-door reps returns generic inside-sales listicles, exactly as the SEO plan predicted. Every roundup that ranks (Mindtickle, Trellus, Kendo, Outdoo, federicopresicci, Knowlee, PitchMonster, aitoolsbakery) covers inside-sales tools. **None of them lists a door-to-door option, because until now there was not one.** Outreach to those specific roundup authors offering Kríos as the D2D entry is a concrete, finite task with high leverage, and it is the mechanism by which LLM answers get built.

**S3. Content gaps this research exposes. Effort S each. Impact medium each.**
- **The Irish 30-day cooling-off rule.** No existing post states it. It is a real, verifiable, distinctively Irish fact that changes how a rep should close, and it is exactly the "US training gets this wrong" shape AGENT.md asks for.
- **The CRU doorstep checklist and ID card requirement.** Same argument. Compliance content that is genuinely useful ranks and gets cited.
- **The EU AI Act and sales coaching software.** Almost nobody has written this for a sales audience. It positions Kríos as the vendor that thought about it, and it is the kind of page a procurement person forwards.
- **A sourced ramp-cost piece** built on SPOTIO's March 2026 survey rather than on the unsourced "USD 5,000 to 15,000 per rep" figures circulating in vendor blogs.

**S4. Off-site presence remains the gap, as the SEO plan already says. Effort M. Impact high.**
Crunchbase has a Krios profile. ThinkBusiness has covered the company. Those two plus a claimed G2 profile and a real LinkedIn company page would let the `sameAs` TODO in `Base.astro` be filled, which is the entity-disambiguation signal the plan correctly identifies as valuable.

**S5. Re-review the comparison pages now, not quarterly. Effort S. Impact medium.**
The pages carry a "last reviewed July 2026" date and the Rilla page already flags Rilla's practice scenarios, which is good. But Siro's door-to-door page is not acknowledged anywhere, and the Siro comparison describes Siro as focused on home services contractors, which understates its positioning. Correct it before a prospect does.

### 5.6 Moat

**The blunt answer: there is not much of one yet, and everyone in this category has the same problem.**

What Kríos has today that is genuinely hard to copy:
- Nothing structural. Persona prompting, voice roleplay, scoring and dashboards are all replicable in a quarter by a competitor with capital.

What is *somewhat* hard to copy:
- **Irish and UK localisation** (dialect, currency, place, regulatory context). Not hard technically. Hard to be bothered with, if you are a US company with a bigger home market. This is a real but temporary moat, worth perhaps 24 months.
- **Doorstep-specific scenario design.** Knowing that the conversation is won or lost in eight seconds, that "already sorted" is the killer objection, that the second knock is a different motion. This is founder knowledge encoded in product. Copyable, but only by someone who has done the job.

What would become a genuine moat, in rough order of durability:

1. **A proprietary dataset of Irish and UK doorstep conversations.** This is what Rilla actually has and what makes it worth USD 757m. If Kríos can get customers to upload or capture real doorstep audio, and can build the objection taxonomy and the outcome linkage from it, then over three years its personas become the only ones trained on the actual conversations happening in Irish estates. `analyze-call` already exists in the backend. **This is the single highest-value strategic asset available to the business.**
2. **Outcome data linking practice to closed deals.** Kríos already pulls CRM data. If it can prove that reps who complete a skill path close at a measurably higher rate on that specific customer's data, it stops being a training tool and becomes a forecasting input. That is very sticky.
3. **Compliance posture as a product.** The EU AI Act, GDPR, CRU rules and the charity code together create a documentation burden that a US-first vendor will handle badly. Being the vendor with an AI Act deployer pack, a DPIA template and CRU-aligned drill packs is a moat made of unglamorous work, which is exactly the kind competitors skip.
4. **Distribution through canvassing platforms or agencies.** An exclusive or preferred integration with an agency network is contractual rather than technical, but it is real.

**What is not a moat, despite feeling like one:** the voice quality, the Nyx personality, the UI, the scoring rubric, the leaderboards, or being first. All of those get copied.

---

## 6. Risks and open questions

**R1. The Rilla and Siro squeeze.** Both are far better capitalised, both are already in the field coaching budget, and one already sells roleplay. If either ships a credible pre-knock practice product with UK and Irish voices, Kríos's differentiation narrows to price and locality. **Mitigation: go deeper on doorstep-specific and Ireland-specific product than a US company will bother to, and build the proprietary conversation dataset now.**

**R2. The canvassing platform squeeze.** SalesRabbit already sells add-ons at USD 13 to 19 per user per month and has a training module. Roleplay as a USD 19 add-on on a seat the buyer already pays for is very hard to compete with on a second invoice. **Mitigation: partner, or be so much better at the specific job that the comparison is embarrassing.**

**R3. Voice unit economics.** At roughly USD 0.08 per minute plus LLM, a heavy-usage seat can consume a meaningful share of a EUR 45 subscription. Success looks like high engagement, which is also the failure mode for gross margin. **Mitigation: explicit minute allowances, pooled across the team, and a smaller model for lower-stakes drills.**

**R4. EU AI Act exposure.** Deferred to 2 December 2027, not removed. Manager-facing performance evaluation of workers is squarely inside Annex III point 4(b). The emotion-inference prohibition in Article 5(1)(f) has been live since February 2025 and "rapport scoring" needs careful language. **Mitigation: get the product description and documentation right in 2026 while it is cheap.**

**R5. Seasonality.** Irish D2D is seasonal: solar and home improvement peak in the brighter months, fibre follows the build schedule, charity F2F runs year-round but recruits in waves. SEAI applications reportedly surged in Q1. **Inference: practice usage, and therefore usage-based revenue, will be lumpy, and the buying window is the pre-season hiring push in roughly January to March.** Annual contracts are important for exactly this reason.

**R6. Buyer budget reality.** A 20-rep Irish solar installer is not a software buyer in the way a SaaS company is. It may have no procurement process, no software budget line and a commercial director who signs everything. This cuts both ways: fast decisions, but small budgets and high sensitivity to any second invoice.

**R7. Rep-side adoption, not manager-side purchase, is where this dies.** Siro's claimed 97% licence utilisation and its jab at Rilla becoming "shelfware that feels like Big Brother" describe the real failure mode in this category. A tool that reps experience as surveillance gets used for two weeks. **Mitigation: keep the rep's raw sessions private from the manager by default, which the pricing FAQ already claims, and make that a headline promise rather than an FAQ answer.**

**R8. Founder capacity and credibility.** Three founders, two of them 17, no disclosed funding beyond ElevenLabs credits. That is a constraint on GTM bandwidth more than on product. It is also a genuine risk with enterprise-shaped buyers like energy suppliers who run vendor due diligence.

**Open questions a human should chase:**

1. **How many door-to-door reps are actually working in Ireland?** Phone BillSave, Uniquely, SCL, the three charity F2F agencies and ten solar installers and ask. This single number determines whether the Irish plan is a beachhead or a hobby.
2. **What does Rilla Roleplay actually do, and when did it launch?** Book a Rilla demo. The public page gives nothing away. This is the most consequential unknown in the report.
3. **Does Siro's door-to-door page convert, or is it a demand-capture shell?** Ask a D2D operator who has seen both.
4. **What do Rilla and Siro actually charge in the UK and Ireland, if they sell there at all?** Every figure in this report is a third-party estimate.
5. **Does SalesRabbit's Amplify Coaching include anything roleplay-like?** Its Enterprise tier is undocumented publicly.
6. **Confirm the SEAI Q1 2026 application surge** against SEAI directly rather than trade press, before using it anywhere public.
7. **Confirm whether the EUR 50 threshold applies to the 30-day doorstep cooling-off right.** The CCPC page I read does not mention it; secondary sources do.
8. **Confirm whether PSA licensing touches the sales function** or only installation and maintenance.
9. **LeadPerfection**: not meaningfully researched here.
10. **Whether the video capture and meeting-bot capability is a deliberate second wedge** or accumulated scope.

---

## 7. Sources appendix

All URLs accessed 9 to 10 August 2026. "Fetched" means I retrieved and read the page. "Search summary" means the page itself was not retrievable (403, paywall or blocked) and the content comes from a search engine's summary of it, which is weaker evidence and is flagged as such in the body.

### Competitors: AI roleplay

| URL | Used for | Access |
|---|---|---|
| https://www.forbes.com/sites/dereknewton/2025/09/15/sales-upskilling-provider-hyerbound-raises-15-million-series-a/ | Hyperbound USD 15m Series A, date, ICP, founders | Fetched |
| https://finance.yahoo.com/news/hyperbound-raises-15-million-series-191000599.html | Hyperbound investors, customer names, ARR momentum | Search summary |
| https://www.hyperbound.ai/pricing | Attempted price check | 403, not retrievable |
| https://www.hyperbound.ai/product/ai-sales-roleplays | Hyperbound scenario types | Search summary |
| https://www.prnewswire.com/news-releases/second-nature-secures-22m-series-b-to-future-proof-sales-and-service-teams-for-the-ai-era-302586229.html | Second Nature USD 22m Series B, investors, clients | Search summary |
| https://kendo.ai/pricing | Kendo published per-seat pricing and minute allowances | Fetched |
| https://yoodli.ai/blog/yoodli-raises-40-million-series-b-to-lead-the-future-of-experiential-learning | Yoodli USD 40m Series B, December 2025 | Search summary |
| https://www.geekwire.com/2025/ai-roleplay-startup-yoodli-raises-40m-reports-900-revenue-growth/ | Yoodli revenue growth claim | Search summary |
| https://yoodli.ai/pricing | Yoodli individual pricing | Search summary |
| https://salesroleplay.app/blog/quantified-ai-pricing-features-cost-and-the-best-alternatives-in-2025 | Quantified reported per-user pricing | Search summary |
| https://www.globenewswire.com/news-release/2026/01/20/3221636/0/en/centrical-launches-ai-role-play-simulations-and-coaching-to-close-the-frontline-readiness-gap.html | Centrical roleplay launch, 20 January 2026 | Search summary |
| https://www.mindtickle.com/blog/best-ai-role-play-tools/ | Category landscape, vendor list | Search summary |
| https://www.trellus.ai/post/ai-sales-role-play-tools | Category landscape, vendor list | Search summary |
| https://www.outdoo.ai/blog/best-ai-sales-roleplay-tools | Category landscape, vendor list | Search summary |
| https://kendo.ai/blogs/best-ai-sales-roleplaying-tools | Category landscape; evidence Kendo runs the comparison playbook | Search summary |
| https://www.pitchmonster.io/blog/top-8-best-tools-for-sales-role-plays-comparison | Category landscape | Search summary |

### Competitors: field and in-person coaching

| URL | Used for | Access |
|---|---|---|
| https://sacra.com/c/rilla/ | Rilla ARR by year, ACV, per-seat pricing, funding rounds, ICP, margins, competitor notes | Fetched |
| https://www.rilla.com/ | Rilla product modules, verticals, named customers, claimed stats | Fetched |
| https://www.rilla.com/roleplay | Confirms Rilla sells a roleplay product | Fetched |
| https://www.youtube.com/watch?v=pI872ELJawA | Rilla Roleplay keynote exists; metadata not retrievable | Partially fetched |
| https://www.prnewswire.com/news-releases/siro-raises-50m-series-b-to-bring-ai-to-in-person-sales-302463711.html | Siro USD 50m Series B, 22 May 2025, investors, D2D verticals | Search summary |
| https://www.siro.ai/solutions/industry/door-to-door | Siro explicitly targets door-to-door; features; named customers; claimed stats | Fetched |
| https://www.siro.ai/siro-vs-rilla | Siro's claims about Rilla, 60+ switchers, 97% utilisation | Fetched |
| https://www.salesask.com/blog-posts/siro-pricing-guide-2026-costs-plans-better-alternatives | Siro pricing estimate (competitor-published, flagged) | Search summary |
| https://www.craftflow.com/transparency/pricing/siro | Siro pricing estimate | Search summary |

### Competitors: D2D software and platforms

| URL | Used for | Access |
|---|---|---|
| https://www.salesrabbit.com/pricing/ | SalesRabbit published plan and add-on pricing, Learn and Amplify Coaching references | Fetched |
| https://salesrabbit.com/insights/salesrabbit-amplify-brings-field-sales-gamification-analytics-into-one-platform/ | Amplify is gamification and analytics, June 2024 | Search summary |
| https://www.capterra.com/p/157701/SPOTIO/ | SPOTIO reported pricing | Search summary |
| https://qbitsenergy.com/blog/sunbase-review/ | Sunbase reported USD 59 per user per month | Search summary |
| https://www.knockbase.com/blog/the-future-of-d2d-sales-ai-apps-automation | Knockbase stated direction towards real-time AI coaching | Search summary |
| https://www.gong.io/press/gong-launches-mission-andromeda-expanding-its-revenue-ai-os-to-enablement-and-account-management | Gong Enable launch, 25 February 2026 | Search summary |
| https://www.cuebo.ai/blog/agentforce-sales-coach-review | Agentforce Sales Coach features and bundling | Search summary |
| https://www.salesforce.com/sales/coaching/sales-coach/ | Attempted primary check on Agentforce Sales Coach | 403, not retrievable |
| https://company.g2.com/news/new-categories-introduced-in-may-2026 | G2 AI Sales Roleplay category created, definition, top three products | Fetched |
| https://www.g2.com/categories/ai-sales-roleplay-tools | Attempted product count | 403, not retrievable |

### Industry data

| URL | Used for | Access |
|---|---|---|
| https://spotio.com/blog/state-of-field-sales-2026/ | Survey methodology (n=452), turnover, ramp, quota, AI adoption, tech stack, published 6 March 2026 | Fetched |
| https://spotio.com/blog/door-to-door-sales/ | Turnover and ramp figures attributed to the same survey; LAER attribution | Fetched |
| https://www.grandviewresearch.com/industry-analysis/sales-enablement-platform-market-report | Sales enablement market size and CAGR | Search summary |
| https://www.fortunebusinessinsights.com/sales-enablement-platform-market-114208 | Alternative market sizing | Search summary |
| https://www.precedenceresearch.com/sales-enablement-platform-market | Alternative market sizing | Search summary |
| https://www.dsa.org/docs/default-source/industry-fact-sheets/dsef-2024-g-o-factsheet.pdf | US direct selling figures, flagged as not the same industry | Search summary |
| https://elevenlabs.io/pricing/agents | Voice agent per-minute and plan pricing | Fetched |
| https://d2dcon.com/ | D2DCon attendance 2,800+, dates 28 to 30 January 2027, organiser | Fetched |
| https://thed2dexperts.com/services/door-to-door-university/ and https://d2du.com/terms-of-service | D2DU verticals and USD 99 per month membership | Search summary |

### Ireland

| URL | Used for | Access |
|---|---|---|
| https://www.cru.ie/about-us/news/over-60000-customers-switched-energy-supplier-in-december/ | December 2025 switching: 37,724 electricity, 11,350 gas, YoY changes, published 2 March 2026 | Fetched |
| https://www.cru.ie/consumer-information/your-rights/energy/ | Doorstep ID card and checklist requirements, Suppliers' Handbook | Search summary |
| https://www.ccpc.ie/consumer-advice/consumer-rights/buying-goods/changing-your-mind | 30-day cooling-off on unsolicited doorstep sales vs 14 days online | Fetched |
| https://www.citizensinformation.ie/en/consumer/shopping/buying-from-a-doorstep-seller/ | Corroboration of the 30-day rule and the EUR 50 threshold claim | Search summary; site returned 403 to direct fetch |
| https://www.solarpowerportal.co.uk/residential-solar/record-year-for-home-solar-pv-systems-in-ireland-in-2025-with-over-34-000-grants-awarded | 34,088 grant-aided solar installs 2025, 29,151 in 2024 | Search summary |
| https://www.farmersjournal.ie/more/renewables/over-33-000-solar-pv-scheme-grants-awarded-in-2025-899870 | 33,048 Solar PV Scheme grants, +16% on 2024, +49% on 2023, 102,000 since 2018 | Search summary |
| https://www.seai.ie/news-and-events/news/end-of-year-statement | Attempted primary SEAI confirmation | 403, not retrievable |
| https://energyefficiency.ie/blog/no-cut-to-solar-panels-grant-in-2026/ | Q1 2026 application surge, EUR 1,800 grant maximum. Trade source, needs re-verification | Search summary |
| https://nbi.ie/news/events/2026/02/05/nbi-end-of-year-update-over-450000-homes-farms-and-businesses-now-ready-to-connect-under-the-national-broadband-plan/ | 451,433 premises passed at 31 January 2026, +33% YoY | Search summary |
| https://www.gov.ie/en/department-of-culture-communications-and-sport/press-releases/national-broadband-plan-passes-500000-premises-as-rollout-enters-final-phase/ | 500,000+ premises passed, 89% of ~566,000 Intervention Area, county completions | Search summary; 403 to direct fetch |
| https://www.cso.ie/en/releasesandpublications/ep/p-cpp2/censusofpopulation2022profile2-housinginireland/housingstock/ | 1,841,152 private occupied dwellings, Census 2022 | Search summary |
| https://www.uniquely.ie/what-we-do/sales-oriented-service/ | 250+ field sales professionals, sectors, training, six-week go-live | Fetched |
| https://billsave.ie/ | Irish field sales agency, sectors, SSE Airtricity campaign | Search summary; 403 to direct fetch |
| https://sclsales.ie/clients/ | Electric Ireland and Flogas field sales history | Search summary |
| https://charitiesinstitute.ie/pages/code-of-practice-for-face-to-face-fundraising | Existence and scope of the F2F Code of Practice | Fetched (contents behind download) |
| https://charitiesinstitute.ie/pages/street-door-diary-system | Street and Door Diary System | Search summary |
| https://www.psa-gov.ie/contractors-introduction/ and https://www.isia.ie/security-licensing-regulation-standards/licensing-electronic-security-systems/ | PSA licensing for alarm and CCTV contractors, SR40 audit | Search summary |
| https://www.thinkbusiness.ie/articles/cork-teen-founders-launch-krios-ai-sales-training-platform/ | Kríos founders, ages, product description, target verticals, expansion plans, ElevenLabs credits, published 16 July 2026 | Fetched |
| https://www.crunchbase.com/organization/krios-9389 | Existence of a Kríos Crunchbase profile | Search result only |

### Regulation

| URL | Used for | Access |
|---|---|---|
| https://artificialintelligenceact.eu/annex/3/ | Annex III point 4(a) and 4(b) verbatim | Fetched |
| https://artificialintelligenceact.eu/article/5/ | Article 5(1)(f) emotion inference prohibition verbatim, effective 2 February 2025 | Fetched |
| https://knowledge.dlapiper.com/dlapiperknowledge/globalemploymentlatestdevelopments/2026/The-Digital-AI-Omnibus-Proposed-deferral-of-high-risk-AI-obligations-under-the-AI-Act | High-risk deferral to 2 December 2027, legislative timeline, published 30 June 2026 | Fetched |
| https://www.recordinglaw.com/world-laws/world-recording-laws/ireland-recording-laws/ and https://gdprlocal.com/gdpr-recording-calls/ | Irish and GDPR call recording posture. Practitioner sources, not the DPC | Search summary |

### Local repository files consulted (read-only, unmodified)

- `D:\Work\krios-blog-agent\AGENT.md`
- `D:\Work\Duolingo-for-D2D\full-prod\marketing\SEO-PLAN.md`
- `D:\Work\Duolingo-for-D2D\full-prod\marketing\src\pages\` (index, pricing, features, how-it-works, for-managers, for-teams, integrations, try-demo, compare/rilla-alternative, compare/siro-alternative)
- `D:\Work\Duolingo-for-D2D\full-prod\marketing\src\content\blog\` (file listing plus targeted greps)
- `D:\Work\Duolingo-for-D2D\full-prod\krios-app\src\` (screen and component listing only)
- `D:\Work\Duolingo-for-D2D\full-prod\Backend\` (file listing, route listing from `main.py`, `locale_hints.py`)
