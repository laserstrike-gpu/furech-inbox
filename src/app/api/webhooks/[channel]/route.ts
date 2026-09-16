import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { getSession } from "@/lib/auth";
import {
  isWebhookPayload,
  type WebhookPayload,
} from "@/lib/validator";

type RouteContext = {
  params: Promise<{
    channel: string;
  }>;
};

type WebhookResponse = {
  messageId: string;
  duplicate: boolean;
};

const ALLOWED_CHANNELS = ["whatsapp", "telegram", "webchat"] as const;

type Channel = (typeof ALLOWED_CHANNELS)[number];

function isChannel(value: string): value is Channel {
  return ALLOWED_CHANNELS.includes(value as Channel);
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  const { channel } = await context.params;

  if (!isChannel(channel)) {
    return Response.json(
      { error: "Unsupported channel" },
      { status: 400 },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  if (!isWebhookPayload(body)) {
    return Response.json(
      { error: "Invalid webhook payload" },
      { status: 400 },
    );
  }

  const payload: WebhookPayload = body;
  const session = await getSession();

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const contactResult = await client.query<{ id: string }>(
      `
        INSERT INTO contacts (
          organization_id,
          channel,
          external_id,
          name
        )
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (organization_id, channel, external_id)
        DO UPDATE SET
          name = COALESCE(EXCLUDED.name, contacts.name),
          updated_at = NOW()
        RETURNING id
      `,
      [
        session.organizationId,
        channel,
        payload.contactExternalId,
        payload.contactName ?? null,
      ],
    );

    const contactId = contactResult.rows[0].id;

    const conversationResult = await client.query<{ id: string }>(
      `
        INSERT INTO conversations (
          organization_id,
          contact_id,
          channel,
          external_id,
          last_message_at
        )
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (organization_id, channel, external_id)
        DO UPDATE SET
          last_message_at = NOW(),
          updated_at = NOW()
        RETURNING id
      `,
      [
        session.organizationId,
        contactId,
        channel,
        payload.conversationExternalId,
      ],
    );

    const conversationId = conversationResult.rows[0].id;

    const messageResult = await client.query<{ id: string }>(
      `
        INSERT INTO messages (
          conversation_id,
          channel,
          external_id,
          direction,
          content
        )
        VALUES ($1, $2, $3, 'inbound', $4)
        ON CONFLICT (conversation_id, channel, external_id)
        DO NOTHING
        RETURNING id
      `,
      [
        conversationId,
        channel,
        payload.externalMessageId,
        payload.text,
      ],
    );

    const duplicate = messageResult.rows.length === 0;

    if (!duplicate) {
      await client.query(
        `
          UPDATE conversations
          SET
            last_message_at = NOW(),
            updated_at = NOW()
          WHERE id = $1
            AND organization_id = $2
        `,
        [conversationId, session.organizationId],
      );
    }

    await client.query("COMMIT");

    const response: WebhookResponse = {
      messageId: messageResult.rows[0]?.id ?? payload.externalMessageId,
      duplicate,
    };

    return Response.json(response, {
      status: duplicate ? 200 : 201,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Webhook error:", error);

    return Response.json(
      { error: "Failed to process webhook" },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}