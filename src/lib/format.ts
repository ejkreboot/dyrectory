import type { Profile } from "./types";

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

const dateFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });
const shortDateFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}

/** Parses a Postgres `date` ("YYYY-MM-DD") as a local calendar date. */
export function parseLocalDate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function formatDueDate(value: string): string {
  const date = parseLocalDate(value);
  const today = startOfToday();
  const days = Math.round((date.getTime() - today.getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  return date.getFullYear() === today.getFullYear() ? shortDateFormat.format(date) : dateFormat.format(date);
}

export function isOverdue(value: string | null): boolean {
  return value !== null && parseLocalDate(value) < startOfToday();
}

export function personName(profile: Pick<Profile, "display_name" | "email"> | null | undefined): string {
  if (!profile) return "Former member";
  return profile.display_name || profile.email;
}

export function firstName(profile: Pick<Profile, "display_name" | "email"> | null | undefined): string {
  return personName(profile).split(/\s+/)[0];
}

export function errorMessage(err: unknown): string {
  if (err && typeof err === "object" && "message" in err && typeof err.message === "string") {
    return err.message;
  }
  return "Something went wrong. Please try again.";
}

/** Readable temporary password, e.g. "k7pm-qx4t-9hdw". */
export function generatePassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789"; // no look-alikes (i, l, o, 0, 1)
  const limit = 256 - (256 % alphabet.length); // reject bytes that would bias the result
  let chars = "";
  while (chars.length < 12) {
    for (const b of crypto.getRandomValues(new Uint8Array(16))) {
      if (b < limit && chars.length < 12) chars += alphabet[b % alphabet.length];
    }
  }
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}
