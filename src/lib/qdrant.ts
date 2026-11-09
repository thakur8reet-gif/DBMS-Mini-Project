import { createHash } from "node:crypto";

const collection = process.env.QDRANT_COLLECTION || "ticket_embeddings";
const model =
  process.env.EMBEDDING_MODEL || "sentence-transformers/all-MiniLM-L6-v2";

function configuration() {
  const endpoint = process.env.QDRANT_URL;
  const apiKey = process.env.QDRANT_API_KEY;
  if (!endpoint || !apiKey) {
    throw new Error("Qdrant Cloud is not configured");
  }
  return { endpoint: endpoint.replace(/\/$/, ""), apiKey };
}

async function request(path: string, init?: RequestInit) {
  const { endpoint, apiKey } = configuration();
  return fetch(`${endpoint}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
      ...init?.headers,
    },
    cache: "no-store",
  });
}

export async function ensureQdrantCollection() {
  const encoded = encodeURIComponent(collection);
  const check = await request(`/collections/${encoded}`);
  if (check.ok) return;
  if (check.status !== 404) throw new Error("Unable to inspect Qdrant collection");

  const created = await request(`/collections/${encoded}`, {
    method: "PUT",
    body: JSON.stringify({
      vectors: { size: 384, distance: "Cosine" },
    }),
  });
  if (!created.ok && created.status !== 409) {
    throw new Error("Unable to create Qdrant collection");
  }
}

function pointId(tenantId: number, ticketId: number) {
  const bytes = createHash("sha1")
    .update(`resolveiq:${tenantId}:${ticketId}`)
    .digest();
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function indexTicket(ticket: {
  tenant_id: number;
  ticket_id: number;
  subject: string;
  description: string;
  category_id: number;
  priority_id: number;
  status: string;
}) {
  await ensureQdrantCollection();
  const response = await request(
    `/collections/${encodeURIComponent(collection)}/points?wait=true`,
    {
      method: "PUT",
      body: JSON.stringify({
        points: [
          {
            id: pointId(ticket.tenant_id, ticket.ticket_id),
            vector: {
              text: `${ticket.subject}\n${ticket.description}`.slice(0, 4000),
              model,
            },
            payload: {
              tenant_id: ticket.tenant_id,
              ticket_id: ticket.ticket_id,
              category_id: ticket.category_id,
              priority_id: ticket.priority_id,
              status: ticket.status,
            },
          },
        ],
      }),
    },
  );
  if (!response.ok) throw new Error("Qdrant could not index the ticket");
}

export async function searchTickets(query: string, tenantId: number, limit: number) {
  await ensureQdrantCollection();
  const response = await request(
    `/collections/${encodeURIComponent(collection)}/points/query`,
    {
      method: "POST",
      body: JSON.stringify({
        query: { text: query, model },
        filter: { must: [{ key: "tenant_id", match: { value: tenantId } }] },
        limit,
        with_payload: true,
      }),
    },
  );
  if (!response.ok) throw new Error("Qdrant search failed");
  const data = (await response.json()) as {
    result?: { points?: Array<{ id: string | number; score: number; payload?: { ticket_id?: number } }> };
  };
  return (data.result?.points ?? [])
    .map((point) => ({
      ticket_id: Number(point.payload?.ticket_id ?? point.id),
      score: point.score,
    }))
    .filter((point) => Number.isFinite(point.ticket_id));
}
