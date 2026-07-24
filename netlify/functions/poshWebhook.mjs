// poshWebhook.mjs — Netlify Function
// Receives Posh order webhooks and appends each order to a Google Sheet.
//
// Env vars (Netlify > Site settings > Environment variables):
//   GOOGLE_SERVICE_ACCOUNT_EMAIL  - service account email
//   GOOGLE_PRIVATE_KEY            - service account private key (keep \n escapes)
//   SHEET_ID                      - Google Sheet ID (from the sheet URL)
//   POSH_WEBHOOK_SECRET           - optional shared secret appended as ?secret= in the webhook URL
//
// Sheet tab must be named "Orders" with header row:
// timestamp | group | event_name | order_id | tickets | gross | is_transfer | raw
//
// GROUP TAGGING: register this webhook inside EACH Posh group's dashboard,
// with a distinct &group=N in the URL (N = 1, 2, 3, or 4). Fallback: a digit
// is extracted from the group/event name in the payload if the param is missing.

import { google } from "googleapis";

// ---- IMPORTANT: field mapping ----
// Posh's webhook payload field names may differ slightly from these guesses.
// In Posh: Settings > API Webhooks > "View Example Response Body",
// then adjust the pickers below to match the actual payload.
function parseOrder(payload) {
  const order = payload.order ?? payload.data ?? payload;

  const orderId =
    order.id ?? order.orderId ?? order._id ?? order.order_id ?? "unknown";

  const eventName =
    order.eventName ?? order.event?.name ?? payload.event?.name ?? "unknown";

  // Gross dollars for the order. Check whether Posh sends dollars or cents.
  let gross =
    order.total ?? order.amount ?? order.subtotal ?? order.grossRevenue ?? 0;
  gross = Number(gross) || 0;

  const tickets = Array.isArray(order.tickets)
    ? order.tickets.length
    : Number(order.ticketCount ?? order.quantity ?? 1) || 1;

  // Posh flags transfer-related activity so it isn't double-counted as a sale.
  const isTransfer = Boolean(
    order.ticket_transfer ?? order.ticketTransfer ?? false
  );

  // Group/organizer name from payload (adjust to real payload field names)
  const groupName =
    order.groupName ?? order.group?.name ?? payload.group?.name ?? "";

  return { orderId, eventName, gross, tickets, isTransfer, groupName };
}

// Determine the group number (1-4): prefer the ?group= URL param set per
// Posh group, otherwise pull the first digit 1-4 from the group/event name.
function resolveGroup(url, groupName, eventName) {
  const fromParam = url.searchParams.get("group");
  if (fromParam && /^[1-4]$/.test(fromParam)) return fromParam;

  const nameMatch = `${groupName} ${eventName}`.match(/[1-4]/);
  return nameMatch ? nameMatch[0] : "unknown";
}

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Optional secret check: set webhook URL in Posh to
  // https://<your-site>.netlify.app/.netlify/functions/poshWebhook?secret=XYZ
  const secret = process.env.POSH_WEBHOOK_SECRET;
  if (secret) {
    const url = new URL(req.url);
    if (url.searchParams.get("secret") !== secret) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  let payload;
  try {
    payload = await req.json();
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  const { orderId, eventName, gross, tickets, isTransfer, groupName } =
    parseOrder(payload);
  const group = resolveGroup(new URL(req.url), groupName, eventName);

  try {
    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const sheets = google.sheets({ version: "v4", auth });

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SHEET_ID,
      range: "Orders!A:H",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [
          [
            new Date().toISOString(),
            group,
            eventName,
            String(orderId),
            tickets,
            gross,
            isTransfer ? "TRUE" : "FALSE",
            JSON.stringify(payload).slice(0, 45000), // raw payload for debugging
          ],
        ],
      },
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Sheet append failed:", err);
    // Return 500 so Posh retries (if their webhooks retry on failure)
    return new Response("Internal error", { status: 500 });
  }
};
