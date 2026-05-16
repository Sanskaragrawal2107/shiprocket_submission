export const APP_TIME_ZONE = "Asia/Kolkata";
export const APP_LOCALE = "en-IN";

export function formatAppDateTime(value, options = {}) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";

  return date.toLocaleString(APP_LOCALE, {
    timeZone: APP_TIME_ZONE,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    ...options,
  });
}

export function formatAppDate(value, options = {}) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString(APP_LOCALE, {
    timeZone: APP_TIME_ZONE,
    day: "numeric",
    month: "short",
    ...options,
  });
}
