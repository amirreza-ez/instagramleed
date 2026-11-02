# Reference Video Analysis — "SellerBot / سلربات"

Source: `-1074951431540964909.mp4` — 40.4 s, 512×910 vertical (phone recording of PC monitors), 29.9 fps, AAC audio.
Method: frames extracted at 2 fps (81 frames) with ffmpeg, contact sheets at 1 fps, key frames cropped and upscaled 2–3× to read Persian UI text. Spoken narration was read from the burned-in subtitles.

Legend: **[O]** directly observed · **[I]** reasonable technical inference · **[?]** unclear, needs investigation.

## 1. Video overview
A promotional reel for a product called **SellerBot (سلربات)**, web app at `app.sellerai.ir/#/extraction/instagram` [O].
Headline overlay: «بدون محتوا سازی بفروش…» ("sell without creating content") and closing CTA «برای مشاوره بنویس سلربات» ("write SellerBot for a consultation") [O].

Narration (from subtitles, paraphrased) [O]:
> You spend all this time on content, never reach Explore and never make sales. Look at this program: with the targeting we set, it **extracts Instagram users** — over 11 thousand, 13 thousand… — and **sends my product offer to these users who could be my main target audience**. If I have advantages, the sale is mine. It can do this work with **automation** and even **present your customers**.

Timeline:
| Time | Content |
|---|---|
| 0–9 s | Several PCs in an office; Instagram web open on a public influencer's Reel (`parisa_sjdi`) with its **comment list** visible. Narrator points at the commenters. [O] |
| 9–13 s | SellerBot "Instagram user extraction" page, stats 1192 / 11945. [O] |
| 13–14 s | A second PC ("System.5" sticker) showing stats 2776 today / 13266 total / 1 account. [O] |
| 14–40 s | Third PC (Samsung monitor) on the same page; narrator explains offer-sending; CTA overlay. [O] |

## 2. Screens identified
1. **Instagram web (third-party)** — another account's post with comments [O]. Used as the *targeting source* [I].
2. **SellerBot → Data extraction → Instagram** (`#/extraction/instagram`) — the only app screen shown [O].
3. **Platform selection** screen — exists, reached by «بازگشت به انتخاب پلتفرم» ("back to platform selection") [O link; screen not shown].
4. The app runs inside a **desktop window** (title bar with minimise/maximise/close, avatar icon) [O] — likely an Electron-style wrapper around the web app [I].

## 3. Control and data inventory (Instagram extraction page)
| Element | Text | Type | Status |
|---|---|---|---|
| Sidebar header | «خوش آمدید system.5» (Welcome system.5) | user/machine label | [O] |
| Sidebar active item | «استخراج داده» (Data extraction) | nav | [O] |
| Sidebar items 2–8 | blurred; plausibly «ارسال پیام» (Send message), «افزایش…», «استخراج … کاربران», «تعریف …», «…», «…», «تنظیمات سیستم» (System settings) | nav | [?] partly legible |
| App title | «سلربات» | brand | [O] |
| Agent status card | «ایجنت شما به‌روز است» (Your agent is up to date) ✓ | status | [O] |
| Release notes | «توضیحات نسخه فعلی: اصلاح ارسال پیام اول واتساپ» (fix WhatsApp first-message sending) | text | [O] |
| Versions | «نسخه نصب‌شده: 3.2.3» · «آخرین نسخه: 3.2.3» | text | [O] |
| Link | «بازگشت به انتخاب پلتفرم ←» | nav | [O] |
| Page title | «استخراج کاربران از اینستاگرام» | heading | [O] |
| Subtitle | «استخراج لید از اینستاگرام و مدیریت لید‌های استخراج شده» | text | [O] |
| Primary button | «▷ شروع استخراج» (Start extraction) — blue | action | [O] |
| Help | «؟ آموزش» (Tutorial) | link | [O] |
| Settings | «⚙ تنظیمات» | action | [O] |
| Stop | «⦸ توقف» (Stop) — pink/red | action | [O] |
| Add account | «+ اکانت جدید» (New account) — purple | action | [O] |
| KPI | «یوزرنیم‌های استخراج شده امروز» = 1192 | stat | [O] |
| KPI | «کل یوزرنیم‌های استخراج شده» = 11945 | stat | [O] |
| KPI | «اکانت‌ها» = 0 | stat | [O] |
| KPI | «اکانت‌های فعال» = 0 | stat | [O] |
| Section | «لاگ‌های سیستم» / «لاگ‌های پلتفرم اینستاگرام» | log panel | [O] heading only |
| Header | bell icon with red badge | notifications | [O] |
| Footer | toggle/button labelled «فارسی» | language | [?] |

## 4. Inferred workflow
1. Install a local **agent** on each PC (versioned, self-updating) [O status card; I mechanism].
2. Choose a platform (Instagram; WhatsApp also supported per release notes) [O/I].
3. Add **Instagram accounts** («اکانت جدید») — the agent logs into real Instagram accounts [I: "accounts / active accounts" counters].
4. Configure **targets** (in «تنظیمات»): e.g. a competitor/influencer post, page or hashtag whose commenters/followers are scraped [I from 0–9 s footage and "targeting" narration].
5. **Start / Stop** extraction; counters grow (today / total); logs stream in the log panel [O controls; I behaviour].
6. **Send messages**: the agent DMs the extracted users with the product offer ("sends my offer to these users") [O narration].
Output: lists of Instagram usernames ("leads"). No CRM, pipeline, segmentation or reporting is shown [O by absence].

Processing states visible: idle/up-to-date agent, running counters. Success/failure presentation: not shown beyond logs [?].

## 5. Legal & technical assessment
The core mechanism — automated logins into Instagram accounts, scraping commenters/followers of **other people's** accounts, and sending **unsolicited automated DMs** — violates Meta's Terms of Use and Platform Terms (automated data collection without permission, spam), risks permanent account bans, and processes personal data without consent. Official Instagram APIs **do not** provide followers or commenters of third-party accounts, nor cold DMs (Instagram messaging is limited to people who contacted the business first, within a 24-hour window). It therefore **cannot be reproduced legitimately** and EAZAZI LEAD INSTAGRAM does not implement it.

## 6. Legitimate equivalents implemented instead
| Reference feature | EAZAZI implementation |
|---|---|
| Extract usernames from posts' commenters | Capture commenters on **your own** posts via official comments API + webhooks, with source attribution |
| Extract "target audience" usernames | **Business Discovery lookup**: enter/import usernames of Instagram *business* accounts (e.g. mobile shops); fetch their public business profile (name, bio, website, followers, media count) through the official API; create qualified B2B leads |
| Send offer DMs to extracted users | Inbound DM capture into CRM + replies inside the 24-hour window; outreach tasks for sales staff (human follow-up); private replies to commenters on own posts |
| Accounts / active accounts | Meta integrations (Instagram Login / Facebook Login) with status, token expiry, logs |
| Start / Stop extraction | Discovery & sync **jobs** with start, progress, cancel, history, error report |
| Today / total counters | Dashboard: daily/weekly/monthly/total leads, qualified, converted, duplicates, conversion rate, charts |
| System logs | Integration logs + audit logs |
| Agent version / update card | Desktop app version + update channel (electron-updater) |
| Platform selection | Lead sources: Instagram, Lead Ads, CSV/XLSX, manual, webhook API |

## 7. Unclear / not shown
Exact sidebar items, targeting settings, message templates, pricing, multi-user support, export features. Not reverse-engineered; no assumptions made in our spec.

## 8. Improvements over the reference
Full CRM (profiles, pipeline status, tags, notes, activity timeline, assignment), campaigns with attribution & conversion analytics, tasks & reminders, smart filters & saved segments, CSV/XLSX import with mapping, validation, duplicate merging and reports, filtered export, multi-tenant SaaS (organisations, roles, plans, usage limits, invoices), audit logs, consent tracking, Persian RTL UI with Jalali dates, web + Windows desktop clients sharing one backend — and compliance with Meta's rules, so customers' Instagram accounts are not put at risk.
