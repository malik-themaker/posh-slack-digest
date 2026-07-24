# Detailed Click-by-Click Setup

This walks through every screen for all 5 pieces: Google Cloud, Google Sheet, Netlify, Posh, Slack, and GitHub. Do them in this order — later steps need values from earlier ones.

---

## PART 1: Google Cloud project + Sheets API

1. Go to **console.cloud.google.com** and sign in with the Google account you want to own this (can be your personal Gmail — doesn't need to be a Workspace account).
2. If this is your first time in the console, click **Agree and Continue** on the terms screen.
3. At the top of the page, click the **project dropdown** (it may say "Select a project" — top-left, next to "Google Cloud").
4. In the dialog that opens, click **New Project** (top-right of the dialog).
5. Type a project name, e.g. `mirrorpixs-sheets`. Leave the location/organization field as default.
6. Click **Create**. A notification bell (top-right) will show progress — wait ~10-15 seconds for it to finish.
7. Click the project dropdown again and **select the project you just created** (this step trips people up — the console can silently stay on your old/default project).
8. In the left sidebar, click the **☰ menu icon** (top-left, three horizontal lines) → hover **APIs & Services** → click **Library**.
9. In the search bar, type `Google Sheets API` and press Enter.
10. Click the **Google Sheets API** result tile.
11. Click the blue **Enable** button. Wait a few seconds for it to activate.

---

## PART 2: Create the service account (your "robot user")

1. Still in the left sidebar: ☰ menu → **APIs & Services** → **Credentials**.
2. Click **+ Create Credentials** (top of page) → select **Service account** from the dropdown.
3. On the "Create service account" screen:
   - **Service account name**: type something like `posh-sheets-writer`
   - The **Service account ID** auto-fills below it — leave it as-is
   - Skip the description field
4. Click **Create and Continue**.
5. On the "Grant this service account access to project" screen, you can **skip this** — click **Continue** without selecting a role (Sheets access is granted later by sharing the actual sheet, not by IAM roles).
6. On the "Grant users access" screen, skip it too — click **Done**.
7. You'll land back on the **Credentials** page. Under "Service Accounts," click the email address of the account you just created (looks like `posh-sheets-writer@mirrorpixs-sheets.iam.gserviceaccount.com`).
8. Click the **Keys** tab (top of the service account detail page).
9. Click **Add Key** → **Create new key**.
10. Choose **JSON** (should be selected by default) → click **Create**.
11. A `.json` file automatically downloads to your computer — something like `mirrorpixs-sheets-a1b2c3d4e5f6.json`. **Keep this file safe and never commit it to GitHub** — it's the credential that lets code write to your sheet.
12. Open that JSON file in a text editor. You need two values out of it:
    - `client_email` — this is your `GOOGLE_SERVICE_ACCOUNT_EMAIL`
    - `private_key` — this is your `GOOGLE_PRIVATE_KEY` (it's a long string starting with `-----BEGIN PRIVATE KEY-----` and containing `\n` characters — copy the entire thing between the quotes, `\n`s included)

---

## PART 3: Create and share the Google Sheet

1. Go to **sheets.google.com** → click the **+ Blank** spreadsheet.
2. Name it (top-left, "Untitled spreadsheet") something like `Posh Ticket Sales`.
3. Right-click the **Sheet1** tab at the bottom → **Rename** → type `Orders`.
4. Click cell **A1** and type this header row across A1:H1 (tab between each):
   `timestamp` `group` `event_name` `order_id` `tickets` `gross` `is_transfer` `raw`
5. Look at the URL in your browser bar. It looks like:
   `https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/edit`
   The long string between `/d/` and `/edit` is your **Sheet ID** — copy it somewhere, you'll need it twice.
6. Click the green **Share** button (top-right).
7. In the "Add people and groups" box, paste the **service account email** from Part 2, step 12 (`client_email`).
8. Make sure the permission dropdown next to it says **Editor**.
9. **Uncheck** "Notify people" (the service account can't read email anyway).
10. Click **Share** (or **Send**).

---

## PART 4: Netlify — deploy the function + set environment variables

*(Assumes you're pushing the `posh-slack` folder to a GitHub repo and connecting it as a new Netlify site. If you already have a Netlify account and GitHub connected, skip to step 5.)*

1. Push the unzipped `posh-slack` project to a new GitHub repo (e.g. via GitHub Desktop, or `git init && git add . && git commit -m "init" && git remote add origin <repo-url> && git push`).
2. Go to **app.netlify.com** and sign in (or sign up with GitHub).
3. Click **Add new site** → **Import an existing project**.
4. Click **Deploy with GitHub**, authorize Netlify if prompted, then select the repo you just pushed.
5. On the deploy settings screen, leave build settings blank/default (there's no build step, just functions) and click **Deploy site**.
6. Once the site exists, go to **Site configuration** (left sidebar) → **Environment variables**.
7. Click **Add a variable** → **Add a single variable**, and add each of these one at a time:
   - Key: `GOOGLE_SERVICE_ACCOUNT_EMAIL` → Value: (the `client_email` from Part 2)
   - Key: `GOOGLE_PRIVATE_KEY` → Value: (the full `private_key` string, `\n`s included)
   - Key: `SHEET_ID` → Value: (the Sheet ID from Part 3, step 5)
   - Key: `POSH_WEBHOOK_SECRET` → Value: (make up any random string, e.g. `mp7x9k2q`)
8. Click **Create variable** after each one.
9. Go to **Deploys** (top nav) → click **Trigger deploy** → **Deploy site**, so the function picks up the new env vars.
10. Once deployed, your function URL is:
    `https://<your-site-name>.netlify.app/.netlify/functions/poshWebhook`
    (find `<your-site-name>` at the top of the Netlify site overview page, or rename it under **Site configuration** → **Site details** → **Change site name**).

---

## PART 5: Register the webhook in each Posh group (x4)

1. Log into **posh.vip** as the admin/owner.
2. Switch the account/organizer selector (top-left or top-right, depending on Posh's current UI) to **Group 1**.
3. Go to **Settings** → look for **API**, **Webhooks**, or **Integrations** in the settings menu.
4. Click **Add Webhook** or **New Webhook**.
5. In the URL field, paste:
   `https://<your-site-name>.netlify.app/.netlify/functions/poshWebhook?secret=mp7x9k2q&group=1`
   (use your real site name and the secret you made up in Part 4, step 7)
6. Select the event type — choose **Order Created** / **Ticket Sale** / "all order events" (whatever Posh calls it — select the broadest sales-related option).
7. Click **Save**.
8. If there's a **Test Webhook** or **Send Test** button, click it.
9. Go back to your Google Sheet — a new row should appear in the `Orders` tab within a few seconds. Check the `group` column shows `1`.
10. Switch to **Group 2** and repeat steps 3–9, changing the URL to end in `&group=2`.
11. Repeat for **Group 3** (`&group=3`) and **Group 4** (`&group=4`).

If your Posh account doesn't show a webhooks option under Settings, it may be gated to certain plans/roles — in that case tell me what you do see under Settings and I'll adjust.

---

## PART 6: Slack incoming webhook

1. Go to **api.slack.com/apps** and sign in with your Slack workspace account.
2. Click **Create New App** → **From scratch**.
3. Name it (e.g. `Posh Sales Bot`), select your workspace, click **Create App**.
4. In the left sidebar of the app settings, click **Incoming Webhooks**.
5. Toggle **Activate Incoming Webhooks** to **On**.
6. Scroll down, click **Add New Webhook to Workspace**.
7. Choose the channel you want the Friday report posted to, click **Allow**.
8. You'll land back on the Incoming Webhooks page — copy the **Webhook URL** shown (starts with `https://hooks.slack.com/services/...`). This is your `SLACK_WEBHOOK_URL`.

---

## PART 7: GitHub Actions secrets + test run

1. Go to your repo on **github.com**.
2. Click **Settings** (top tab of the repo, not your account settings).
3. In the left sidebar, click **Secrets and variables** → **Actions**.
4. Click **New repository secret**, and add each of these one at a time (name exactly as shown, then paste the value):
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `GOOGLE_PRIVATE_KEY`
   - `SHEET_ID`
   - `SLACK_WEBHOOK_URL`
5. Click **Add secret** after each.
6. Click the **Actions** tab (top of repo).
7. In the left sidebar, click **Friday Posh Sales Digest**.
8. Click the **Run workflow** dropdown (right side) → **Run workflow** button.
9. Wait ~15-30 seconds, refresh, click into the run to watch it — green checkmark means it posted to Slack. Go check the Slack channel.

---

## Troubleshooting checklist

- **No row appears in the Sheet after a test webhook**: check Netlify → Site → **Logs** → **Functions** → `poshWebhook` for the error.
- **Function errors with "invalid_grant" or auth error**: the `GOOGLE_PRIVATE_KEY` env var likely lost its `\n` line breaks when pasted — repaste carefully, keeping it as one line with literal `\n` characters intact.
- **Sheet row appears but `group` column is blank/wrong**: double check the `&group=N` is actually in the URL you pasted into Posh for that group.
- **GitHub Action fails on `Run weekly digest` step**: click into the failed step to read the error — most common cause is a mistyped secret name.
