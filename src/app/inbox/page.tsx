"use client";

import { useEffect, useState } from "react";

type Message = {
  id: string;
  content: string;
  direction: "inbound" | "outbound";
  createdAt: string;
};

type Conversation = {
  id: string;
  contact: {
    id: string;
    name: string | null;
  };
  channel: string;
  externalId: string;
  lastMessageAt: string;
  lastMessage: Message | null;
};

type ConversationsResponse = {
  conversations: Conversation[];
  page: number;
  limit: number;
};

type MessagesResponse = {
  messages: Message[];
};

export default function InboxPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadConversations() {
      try {
        const response = await fetch("/api/conversations");

        if (!response.ok) {
          throw new Error("Failed to load conversations");
        }

        const data: ConversationsResponse = await response.json();

        setConversations(data.conversations);
        setSelected(data.conversations[0] ?? null);
      } catch {
        setError("No se pudieron cargar las conversaciones.");
      } finally {
        setLoading(false);
      }
    }

    void loadConversations();
  }, []);

  useEffect(() => {
    async function loadMessages() {
      if (!selected) {
        setMessages([]);
        return;
      }

      setLoadingMessages(true);

      try {
        const response = await fetch(
          `/api/conversations/${selected.id}/messages`,
        );

        if (!response.ok) {
          throw new Error("Failed to load messages");
        }

        const data: MessagesResponse = await response.json();

        setMessages(data.messages);
      } catch {
        setMessages([]);
      } finally {
        setLoadingMessages(false);
      }
    }

    void loadMessages();
  }, [selected]);

  if (loading) {
    return <main className="p-6">Cargando...</main>;
  }

  if (error) {
    return <main className="p-6">{error}</main>;
  }

  return (
    <main className="flex min-h-screen">
      <section className="w-1/3 border-r">
        <div className="border-b p-4">
          <h1 className="text-xl font-bold">Inbox</h1>
        </div>

        {conversations.length === 0 ? (
          <p className="p-4">No hay conversaciones.</p>
        ) : (
          <div>
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => setSelected(conversation)}
                className="block w-full border-b p-4 text-left"
              >
                <strong>
                  {conversation.contact.name ?? "Sin nombre"}
                </strong>

                <div className="text-sm">
                  {conversation.channel}
                </div>

                <div className="text-sm">
                  {conversation.lastMessage?.content ?? "Sin mensajes"}
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="flex-1 p-6">
        {selected ? (
          <>
            <h2 className="text-xl font-bold">
              {selected.contact.name ?? "Sin nombre"}
            </h2>

            <p className="text-sm">
              Canal: {selected.channel}
            </p>

            <div className="mt-6">
              {loadingMessages ? (
                <p>Cargando mensajes...</p>
              ) : messages.length === 0 ? (
                <p>No hay mensajes.</p>
              ) : (
                <div className="space-y-3">
                  {messages.map((message) => (
                    <div key={message.id}>
                      <p>{message.content}</p>

                      <p className="text-sm">
                        {message.direction === "inbound"
                          ? "Entrante"
                          : "Saliente"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <p>Seleccioná una conversación.</p>
        )}
      </section>
    </main>
  );
}