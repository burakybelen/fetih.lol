// Lemon Squeezy'nin "order_created" bildirimini dinler, imzayı doğrular,
// sadece GERÇEKTEN ödeme tamamlandıysa Supabase'e ülkeyi yazar.

const crypto = require("crypto");

const SUPABASE_URL = "https://nkcsjjvxcerqusgbctkw.supabase.co";
const SUPABASE_KEY = "sb_publishable_DpTJEnBLg0oKRjV3v4CSyA_UrQeTUbC";

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  if (!secret) {
    return { statusCode: 500, body: "LEMONSQUEEZY_WEBHOOK_SECRET env var eksik" };
  }

  const rawBody = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;

  const signatureHeader = event.headers["x-signature"] || event.headers["X-Signature"];
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const valid =
    signatureHeader &&
    signatureHeader.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));

  if (!valid) {
    return { statusCode: 401, body: "Geçersiz imza" };
  }

  const payload = JSON.parse(rawBody);
  const eventName = payload.meta && payload.meta.event_name;

  if (eventName !== "order_created") {
    return { statusCode: 200, body: "ignored" };
  }

  const custom = (payload.meta && payload.meta.custom_data) || {};
  const country_id = custom.country_id;
  const owner_name = custom.owner_name;
  const social = custom.social || null;

  const order = payload.data.attributes;
  const status = order.status; // "paid" beklenir
  const totalCents = order.total;

  if (status !== "paid" || !country_id || !owner_name) {
    return { statusCode: 200, body: "skipped (unpaid or missing data)" };
  }

  const price = Math.round(totalCents / 100);
  const row = { country_id, owner_name, social, price };

  const baseHeaders = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json"
  };

  await fetch(`${SUPABASE_URL}/rest/v1/claims?on_conflict=country_id`, {
    method: "POST",
    headers: { ...baseHeaders, Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify(row)
  });
  await fetch(`${SUPABASE_URL}/rest/v1/bids`, {
    method: "POST",
    headers: baseHeaders,
    body: JSON.stringify(row)
  });

  return { statusCode: 200, body: "ok" };
};
