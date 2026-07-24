// weeklyDigest.mjs — run by GitHub Actions every Friday
// Reads the Orders sheet, sums the last 7 days (excluding transfers),
// and posts a summary to Slack via incoming webhook.
//
// Env vars (GitHub repo > Settings > Secrets and variables > Actions):
//   GOOGLE_SERVICE_ACCOUNT_EMAIL
//   GOOGLE_PRIVATE_KEY
//   SHEET_ID
//   SLACK_WEBHOOK_URL

import { google } from "googleapis";

const DAYS = 7;

async function main() {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SHEET_ID,
    range: "Orders!A2:G", // skip header; ignore raw column
  });

  const rows = res.data.values ?? [];
  const cutoff = Date.now() - DAYS * 24 * 60 * 60 * 1000;

  let gross = 0;
  let tickets = 0;
  let orders = 0;
  const byGroup = {};

  // Columns: timestamp | group | event_name | order_id | tickets | gross | is_transfer
  for (const [ts, group, eventName, , ticketCount, amount, isTransfer] of rows) {
    const time = Date.parse(ts);
    if (isNaN(time) || time < cutoff) continue;
    if (String(isTransfer).toUpperCase() === "TRUE") continue; // skip transfers

    const amt = Number(amount) || 0;
    const qty = Number(ticketCount) || 0;

    gross += amt;
    tickets += qty;
    orders += 1;

    const g = group || "unknown";
    byGroup[g] = byGroup[g] || { gross: 0, tickets: 0, events: {} };
    byGroup[g].gross += amt;
    byGroup[g].tickets += qty;

    const ev = eventName || "Unknown event";
    byGroup[g].events[ev] = byGroup[g].events[ev] || { gross: 0, tickets: 0 };
    byGroup[g].events[ev].gross += amt;
    byGroup[g].events[ev].tickets += qty;
  }

  const money = (n) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD" });

  // Sort groups 1-4 numerically, "unknown" last
  const groupBlocks = Object.entries(byGroup)
    .sort(([a], [b]) => {
      if (a === "unknown") return 1;
      if (b === "unknown") return -1;
      return Number(a) - Number(b);
    })
    .map(([g, s]) => {
      const label = g === "unknown" ? "Ungrouped" : `Group ${g}`;
      const eventLines = Object.entries(s.events)
        .sort((x, y) => y[1].gross - x[1].gross)
        .map(
          ([name, e]) => `    • ${name}: ${money(e.gross)} (${e.tickets} tickets)`
        )
        .join("\n");
      return `*${label}:* ${money(s.gross)} — ${s.tickets} tickets\n${eventLines}`;
    })
    .join("\n\n");

  const text =
    orders === 0
      ? `🎟️ *Weekly Posh Sales Report*\nNo ticket sales in the last ${DAYS} days.`
      : `🎟️ *Weekly Posh Sales Report* (last ${DAYS} days)\n` +
        `*Total volume:* ${money(gross)}\n` +
        `*Tickets sold:* ${tickets} across ${orders} orders\n\n` +
        `${groupBlocks}`;

  const slackRes = await fetch(process.env.SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!slackRes.ok) {
    throw new Error(`Slack post failed: ${slackRes.status}`);
  }
  console.log("Posted to Slack:", { gross, tickets, orders });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
