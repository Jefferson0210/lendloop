/** Idempotency keys for n8n write-backs. One key per logical action. */
export function reminderKey(loanId: string, day: string) {
  return `reminder:${loanId}:${day}`;
}

export function notificationKey(eventId: string) {
  return `notify:${eventId}`;
}
