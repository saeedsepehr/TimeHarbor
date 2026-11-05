const formatters = new Map<string, Intl.DateTimeFormat>();
function parts(at: number, timeZone: string): Record<string, number> {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    if (formatters.size >= 16) formatters.clear();
    formatters.set(timeZone, formatter);
  }
  return Object.fromEntries(
    formatter
      .formatToParts(at)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, Number(p.value)]),
  );
}
export function validTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 80) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
export function zonedDay(at: number, timeZone: string): string {
  const p = parts(at, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}
function midnight(
  year: number,
  month: number,
  day: number,
  timeZone: string,
): number {
  const intended = Date.UTC(year, month - 1, day);
  let guess = intended;
  for (let i = 0; i < 4; i++) {
    const p = parts(guess, timeZone);
    const delta =
      intended -
      Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!);
    if (!delta) break;
    guess += delta;
  }
  return guess;
}
export function zonedDayStart(at: number, timeZone: string): number {
  const p = parts(at, timeZone);
  return midnight(p.year!, p.month!, p.day!, timeZone);
}
export function zonedNextMidnight(at: number, timeZone: string): number {
  const p = parts(at, timeZone),
    date = new Date(Date.UTC(p.year!, p.month! - 1, p.day! + 1));
  return midnight(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    timeZone,
  );
}
