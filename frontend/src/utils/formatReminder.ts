// Small shared formatter for showing a "time" trigger's scheduled instant
// in the UI (Home's alarm icon subtitle, Trigger Setup's picker row).
import dayjs from "dayjs";

export function formatReminderLabel(iso: string): string {
  const target = dayjs(iso);
  const now = dayjs();
  if (target.isSame(now, "day")) return `Today, ${target.format("h:mm A")}`;
  if (target.isSame(now.add(1, "day"), "day")) return `Tomorrow, ${target.format("h:mm A")}`;
  return target.format("MMM D, h:mm A");
}
