// Verify Rank Tracker webhook signatures (X-SpeedyIndex-Signature: sha256=<hex HMAC-SHA256 of the raw body>).
import { createHmac, timingSafeEqual } from "node:crypto";

export function sign(body, secret) {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

/** True if any comma-separated signature in the header matches (two during secret rotation). */
export function verifySignature(body, header, secret) {
  if (!header || !secret) return false;
  const expected = Buffer.from(sign(body, secret));
  return String(header).split(",").map((s) => Buffer.from(s.trim()))
    .some((s) => s.length === expected.length && timingSafeEqual(s, expected));
}

/** Verify, then parse. Throws on a bad signature. Process each event_id once: deliveries may repeat. */
export function parseEvent(body, header, secret) {
  if (!verifySignature(body, header, secret)) throw new Error("invalid SpeedyIndex webhook signature");
  return JSON.parse(Buffer.isBuffer(body) ? body.toString("utf8") : String(body));
}
