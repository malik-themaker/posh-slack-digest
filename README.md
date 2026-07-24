# Posh → Slack Weekly Sales Digest

Posh has no pull API for sales, so this uses their webhooks: every order is logged to a Google Sheet in real time via a Netlify function, and a GitHub Actions cron sums the week and posts to Slack every Friday.

```
Posh webhook ──▶ Netlify function ──▶ Google Sheet ──▶ GitHub Actions (Fri cron) ──▶ Slack
```

## 1. Google Sheet + service account

1. Create a Google Sheet. Rename the first tab to **Orders** and add a header row:
   `timestamp | group | event_name | order_id | tickets | gross | is_transfer | raw`
2. In Google Cloud Console: create a project → enable **Google Sheets API** → create a **service account** → create a JSON key.
3. Share the Sheet with the service account's email (Editor access).
4. Note the Sheet ID from the URL: `docs.google.com/spreadsheets/d/<SHEET_ID>/edit`.

## 2. Netlify function

1. Drop `netlify/functions/poshWebhook.mjs` into your Netlify site repo (or a new site). Add `googleapis` to the site's `package.json` dependencies.
2. Set env vars in Netlify → Site settings → Environment variables:
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `GOOGLE_PRIVATE_KEY` (paste the full key from the JSON file, `\n` escapes intact)
   - `SHEET_ID`
   - `POSH_WEBHOOK_SECRET` (any random string)
3. Note: this needs a repo-linked or CLI deploy so `node_modules` bundle — drag-and-drop won't install `googleapis`.

## 3. Posh webhooks — one per group

You have 4 groups (with 1, 2, 3, 4 in their names). Register the same endpoint **inside each group's dashboard**, tagging each with its number:

1. In Posh, switch into **Group 1** → Settings → API Webhooks.
2. Endpoint:
   `https://<your-site>.netlify.app/.netlify/functions/poshWebhook?secret=<POSH_WEBHOOK_SECRET>&group=1`
3. Click **Test Webhook**, then check the Sheet — the new row should show `1` in the group column.
4. Repeat for the other three groups, changing only `&group=2`, `&group=3`, `&group=4`.

The `&group=N` param is the source of truth. As a backup, if the param is ever missing, the function extracts the first digit 1–4 from the group/event name in the payload; anything unmatched lands in an "Ungrouped" bucket in the report so no sale is silently dropped.

**Adjust field mapping:** click "View Example Response Body" in Posh and compare against the `parseOrder()` function in `poshWebhook.mjs`. Fix the field names for order ID, total, ticket count, event name, and group name to match the real payload. Also verify whether `total` is dollars or cents — if cents, divide by 100.

## 4. Slack incoming webhook

1. api.slack.com/apps → Create app → enable **Incoming Webhooks** → add webhook to your target channel.
2. Copy the webhook URL.

## 5. GitHub Actions

1. Push this repo (workflow file + `scripts/weeklyDigest.mjs`) to GitHub.
2. Repo → Settings → Secrets and variables → Actions → add:
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `GOOGLE_PRIVATE_KEY`
   - `SHEET_ID`
   - `SLACK_WEBHOOK_URL`
3. Test now: Actions tab → "Friday Posh Sales Digest" → **Run workflow**.
4. It then runs automatically every Friday at 21:00 UTC (5 PM EDT).

## Sample Slack output

```
🎟️ Weekly Posh Sales Report (last 7 days)
Total volume: $850.00
Tickets sold: 20 across 4 orders

Group 1: $175.00 — 5 tickets
    • Summer Kickoff: $175.00 (5 tickets)

Group 2: $175.00 — 5 tickets
    • Rooftop Social: $175.00 (5 tickets)

Group 4: $500.00 — 10 tickets
    • Gala Night: $500.00 (10 tickets)
```

## Notes

- Transfers: rows flagged `is_transfer = TRUE` are excluded from totals so ticket transfers don't inflate sales.
- The `raw` column keeps the full webhook JSON for debugging/backfill.
- To change the report window, edit `DAYS` in `weeklyDigest.mjs`.
