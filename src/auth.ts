export interface PinRecord {
  salt: string;
  hash: string;
  failures: number;
  blockedUntil: number;
}
const encode = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
async function derive(pin: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bytes = new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt: new TextEncoder().encode(salt),
        iterations: 310_000,
      },
      key,
      256,
    ),
  );
  return encode(bytes);
}
export async function createPin(pin: unknown): Promise<PinRecord> {
  if (typeof pin !== "string" || !/^\d{4}$/.test(pin))
    throw Error("PIN must contain exactly four digits");
  const salt = encode(crypto.getRandomValues(new Uint8Array(16)));
  return { salt, hash: await derive(pin, salt), failures: 0, blockedUntil: 0 };
}
export async function verifyPin(
  record: PinRecord,
  pin: unknown,
  now: number,
): Promise<boolean> {
  if (now < record.blockedUntil)
    throw Error(
      `Try again in ${Math.ceil((record.blockedUntil - now) / 1000)} seconds`,
    );
  const candidate = await derive(
    typeof pin === "string" && /^\d{4}$/.test(pin) ? pin : "invalid",
    record.salt,
  );
  let diff = 0;
  for (let i = 0; i < record.hash.length; i++)
    diff |= record.hash.charCodeAt(i) ^ candidate.charCodeAt(i);
  if (diff === 0) {
    record.failures = 0;
    record.blockedUntil = 0;
    return true;
  }
  record.failures++;
  if (record.failures >= 5)
    record.blockedUntil =
      now + Math.min(900_000, 30_000 * 2 ** Math.min(5, record.failures - 5));
  return false;
}
export function trustedPage(
  sender: browser.runtime.MessageSender,
  extensionId: string,
  origin: string,
): boolean {
  if (sender.id !== extensionId || !sender.url) return false;
  try {
    const u = new URL(sender.url),
      base = new URL(origin);
    return (
      u.protocol === base.protocol &&
      u.host === base.host &&
      ["/ui/options.html", "/ui/popup.html", "/ui/blocked.html"].includes(
        u.pathname,
      )
    );
  } catch {
    return false;
  }
}
