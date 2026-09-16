import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { getSession } from "@/lib/auth";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type SendMessageBody = {
  text: string;
};

type MessageResponse = {
  id: string;
  conversationId: string;
  direction: "outbound";
  content: string;
};

function isSendMessageBody(value: unknown): value is SendMessageBody {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const body = value as Record<string, unknown>;

  return typeof body.text === "string" && body.text.trim().length > 0;
}

type ProviderMessage = {
  channel: string;
  externalId: string;
  text: string;
};

async function sendMessageStub(
  message: ProviderMessage,
): Promise<void> {
  // Stub del proveedor externo.
  // En producción acá iría la llamada a WhatsApp,
  // Telegram o el proveedor correspondiente.
  void message;
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  const { id: conversationId } = await context.params;

  if (!conversationId) {
    return Response.json(
      { error: "Conversation id is required" },
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

  if (!isSendMessageBody(body)) {
    return Response.json(
      { error: "Invalid message payload" },
      { status: 400 },
    );
  }

  const session = await getSession();

  const conversationResult = await pool.query<{
    id: string;
    channel: string;
    external_id: string;
  }>(
    `
      SELECT
        id,
        channel,
        external_id
      FROM conversations
      WHERE id = $1
        AND organization_id = $2
      LIMIT 1
    `,
    [conversationId, session.organizationId],
  );

  const conversation = conversationResult.rows[0];

  if (!conversation) {
    return Response.json(
      { error: "Conversation not found" },
      { status: 404 },
    );
  }

  const externalMessageId = crypto.randomUUID();
  const text = body.text.trim();

  await sendMessageStub({
    channel: conversation.channel,
    externalId: conversation.external_id,
    text,
  });

  const messageResult = await pool.query<{
    id: string;
    conversation_id: string;
    content: string;
  }>(
    `
      INSERT INTO messages (
        conversation_id,
        channel,
        external_id,
        direction,
        content
      )
      VALUES ($1, $2, $3, 'outbound', $4)
      RETURNING
        id,
        conversation_id,
        content
    `,
    [
      conversation.id,
      conversation.channel,
      externalMessageId,
      text,
    ],
  );

  await pool.query(
    `
      UPDATE conversations
      SET
        last_message_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
        AND organization_id = $2
    `,
    [conversation.id, session.organizationId],
  );

  const message = messageResult.rows[0];

  const response: MessageResponse = {
    id: message.id,
    conversationId: message.conversation_id,
    direction: "outbound",
    content: message.content,
  };

  return Response.json(response, { status: 201 });
}

export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  void request;

  const { id: conversationId } = await context.params;

  if (!conversationId) {
    return Response.json(
      { error: "Conversation id is required" },
      { status: 400 },
    );
  }

  const session = await getSession();

  const conversationResult = await pool.query<{
    id: string;
  }>(
    `
      SELECT id
      FROM conversations
      WHERE id = $1
        AND organization_id = $2
      LIMIT 1
    `,
    [conversationId, session.organizationId],
  );

  if (!conversationResult.rows[0]) {
    return Response.json(
      { error: "Conversation not found" },
      { status: 404 },
    );
  }

  const messagesResult = await pool.query<{
    id: string;
    content: string;
    direction: "inbound" | "outbound";
    created_at: string;
  }>(
    `
      SELECT
        id,
        content,
        direction,
        created_at
      FROM messages
      WHERE conversation_id = $1
      ORDER BY created_at ASC
    `,
    [conversationId],
  );

  return Response.json({
    messages: messagesResult.rows.map((message) => ({
      id: message.id,
      content: message.content,
      direction: message.direction,
      createdAt: message.created_at,
    })),
  });
}