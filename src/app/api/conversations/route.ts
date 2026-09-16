import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { getSession } from "@/lib/auth";

type ConversationRow = {
  id: string;
  contact_id: string;
  contact_name: string | null;
  channel: string;
  external_id: string;
  last_message_at: string;
  message_id: string | null;
  message_content: string | null;
  message_direction: "inbound" | "outbound" | null;
  message_created_at: string | null;
};

type ConversationResponse = {
  id: string;
  contact: {
    id: string;
    name: string | null;
  };
  channel: string;
  externalId: string;
  lastMessageAt: string;
  lastMessage: {
    id: string;
    content: string;
    direction: "inbound" | "outbound";
    createdAt: string;
  } | null;
};

type ConversationsResponse = {
  conversations: ConversationResponse[];
  page: number;
  limit: number;
};

export async function GET(request: NextRequest): Promise<Response> {
  const session = await getSession();

  const searchParams = request.nextUrl.searchParams;

  const pageValue = Number(searchParams.get("page") ?? "1");
  const limitValue = Number(searchParams.get("limit") ?? "20");

  const page = Number.isInteger(pageValue) && pageValue > 0
    ? pageValue
    : 1;

  const limit = Number.isInteger(limitValue) && limitValue > 0
    ? Math.min(limitValue, 100)
    : 20;

  const offset = (page - 1) * limit;

  const result = await pool.query<ConversationRow>(
    `
      SELECT
        c.id,
        c.contact_id,
        ct.name AS contact_name,
        c.channel,
        c.external_id,
        c.last_message_at,
        m.id AS message_id,
        m.content AS message_content,
        m.direction AS message_direction,
        m.created_at AS message_created_at
      FROM conversations c
      INNER JOIN contacts ct
        ON ct.id = c.contact_id
      LEFT JOIN LATERAL (
        SELECT
          id,
          content,
          direction,
          created_at
        FROM messages
        WHERE messages.conversation_id = c.id
        ORDER BY created_at DESC
        LIMIT 1
      ) m ON true
      WHERE c.organization_id = $1
      ORDER BY c.last_message_at DESC
      LIMIT $2
      OFFSET $3
    `,
    [session.organizationId, limit, offset],
  );

  const conversations: ConversationResponse[] = result.rows.map(
    (row) => ({
      id: row.id,
      contact: {
        id: row.contact_id,
        name: row.contact_name,
      },
      channel: row.channel,
      externalId: row.external_id,
      lastMessageAt: row.last_message_at,
      lastMessage: row.message_id
        ? {
            id: row.message_id,
            content: row.message_content ?? "",
            direction: row.message_direction as
              | "inbound"
              | "outbound",
            createdAt: row.message_created_at ?? row.last_message_at,
          }
        : null,
    }),
  );

  const response: ConversationsResponse = {
    conversations,
    page,
    limit,
  };

  return Response.json(response);
}