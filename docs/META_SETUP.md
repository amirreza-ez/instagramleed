# Connecting Instagram & Meta (official APIs)

EAZAZI LEAD uses only Meta's official APIs. You need your own Meta app; the application shows every URL you need on **اتصال اینستاگرام و متا** (Integrations) for admins.

> ⚠️ The endpoint/permission names below follow Meta's documentation as of 2025–2026. Meta changes the Graph API regularly — confirm against https://developers.facebook.com/docs before App Review. The Graph version is configurable via `META_GRAPH_VERSION`.

## 1. Prerequisites
- An Instagram **Professional** account (Business or Creator).
- For Lead Ads and Business Discovery: a Facebook **Page** linked to that Instagram account, and a Meta Business portfolio.
- A public **HTTPS** domain for the API (Meta does not call `localhost`). For local testing use a tunnel (e.g. Cloudflare Tunnel) and set `API_URL` to it.

## 2. Create the app
1. developers.facebook.com → My Apps → Create app → type **Business**.
2. Add products:
   - **Instagram** → "API setup with Instagram login" → copy *Instagram App ID / Secret* → `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`.
   - **Facebook Login for Business** → App ID / Secret (App settings → Basic) → `META_APP_ID`, `META_APP_SECRET`.
   - **Webhooks**.
3. Valid OAuth Redirect URIs (copy from the Integrations page):
   - `{API_URL}/api/meta/callback/instagram`
   - `{API_URL}/api/meta/callback/facebook`

## 3. Permissions requested
| Login | Scopes | Used for |
|---|---|---|
| Instagram Login | `instagram_business_basic`, `instagram_business_manage_comments`, `instagram_business_manage_messages` | Own profile, comments on own media → leads, DMs → leads, replies |
| Facebook Login | `pages_show_list`, `pages_read_engagement`, `pages_manage_metadata`, `leads_retrieval`, `instagram_basic`, `business_management` | Pages, Lead Ads webhook + retrieval, Business Discovery |

Advanced Access for these permissions requires **Meta App Review** and **Business Verification**. Until approved, only users with a role on the app (admins/developers/testers) can connect.

## 4. Webhooks
- Callback URL: `{API_URL}/api/webhooks/meta`
- Verify token: value of `META_WEBHOOK_VERIFY_TOKEN` (auto-generated in `.env`).
- Subscribe **Instagram** object fields: `comments`, `messages`, `mentions`.
- Subscribe **Page** object field: `leadgen` (the app also calls `POST /{page-id}/subscribed_apps` automatically on connection).
- Payloads are verified with `X-Hub-Signature-256` (HMAC-SHA256 of the raw body with the app secret) and deduplicated.

## 5. What you get
- Comment on your post → lead (source: کامنت اینستاگرام) with comment text in the timeline.
- DM to your account → lead (source: دایرکت اینستاگرام); reply from the lead page within Meta's 24-hour window.
- Lead Ads form submission → lead with all form fields, consent recorded, auto-attributed to a campaign whose *Meta campaign id* matches.
- Business Discovery: paste usernames of public Business/Creator accounts → lead with name, bio, website and follower count.
- Token handling: Instagram long-lived tokens (≈60 days) are refreshed automatically every 6 h when within 10 days of expiry; expired tokens are flagged in the UI.

## 6. Not possible with official APIs (by design)
Listing followers or commenters of other people's accounts, sending DMs to people who never contacted you, logging in with an Instagram username/password, or bypassing rate limits. The reference product's scraping/auto-DM approach violates Meta's terms and is not implemented.
