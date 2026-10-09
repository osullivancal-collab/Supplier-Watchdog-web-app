// Input checks for the API routes. normalizeEmail, boundedText, the date check
// and decodeImageDataUrl are copied from SoleTasker's api/_validation.js
// (decodeImageDataUrl checks the file's real magic bytes, not just its label).

export function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,63}$/.test(email) ? email : null;
}

export const boundedText = (value, max) => {
  const text = String(value || "").trim();
  return text.length <= max ? text : null;
};

export const nullableText = (value, max) => value == null || (typeof value === "string" && value.length <= max);
export const realIsoDate = (value) => {
  if (value == null) return true;
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const y = Number(match[1]), m = Number(match[2]), d = Number(match[3]);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};

export function decodeImageDataUrl(value, maxBytes) {
  const match = String(value || "").match(/^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > maxBytes) return null;
  const kind = match[1] === "jpg" ? "jpeg" : match[1];
  const jpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9;
  const png = buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const webp = buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
  if ((kind === "jpeg" && !jpeg) || (kind === "png" && !png) || (kind === "webp" && !webp)) return null;
  return { buffer, mime: `image/${kind}`, extension: kind === "jpeg" ? "jpg" : kind };
}
