export type WebhookPayload = {
  externalMessageId: string;
  contactExternalId: string;
  contactName?: string;
  conversationExternalId: string;
  text: string;
};

export function isWebhookPayload(
  value: unknown,
): value is WebhookPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const payload = value as Record<string, unknown>;

  return (
    typeof payload.externalMessageId === "string" &&
    typeof payload.contactExternalId === "string" &&
    (payload.contactName === undefined ||
      typeof payload.contactName === "string") &&
    typeof payload.conversationExternalId === "string" &&
    typeof payload.text === "string"
  );
}