export type Session = {
  userId: string;
  organizationId: string;
};

export async function getSession(): Promise<Session> {
  return {
    userId: "00000000-0000-0000-0000-000000000001",
    organizationId: "00000000-0000-0000-0000-000000000001",
  };
}