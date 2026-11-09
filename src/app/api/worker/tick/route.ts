import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getSession } from "@/lib/session";
import { indexTicket } from "@/lib/qdrant";

export const dynamic = "force-dynamic";

function validCronRequest(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const value = request.headers.get("authorization") || "";
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const provided = Buffer.from(value);
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

async function tick(tenantId: number | null) {
  const tenantRows = tenantId === null
    ? await pool.query<{ tenant_id: number }>("SELECT tenant_id FROM tenant WHERE is_active=true")
    : { rows: [{ tenant_id: tenantId }] };
  let escalations = 0;
  for (const tenant of tenantRows.rows) {
    const result = await pool.query<{ count: number }>(
      "SELECT fn_evaluate_sla($1) AS count",
      [tenant.tenant_id],
    );
    escalations += Number(result.rows[0]?.count ?? 0);
  }

  const queued = await pool.query<{
    tenant_id: number;
    ticket_id: number;
    subject: string;
    description: string;
    category_id: number;
    priority_id: number;
    status: string;
  }>(
    `SELECT q.tenant_id, q.ticket_id, t.subject, t.description,
            t.category_id, t.priority_id, s.name AS status
     FROM ticket_vector_queue q
     JOIN ticket t USING (tenant_id, ticket_id)
     JOIN ticket_status s ON (s.tenant_id, s.status_id) = (t.tenant_id, t.status_id)
     WHERE ($1::bigint IS NULL OR q.tenant_id = $1)
     ORDER BY q.queued_at
     LIMIT 20`,
    [tenantId],
  );

  let indexed = 0;
  for (const ticket of queued.rows) {
    try {
      await indexTicket(ticket);
      await pool.query(
        "DELETE FROM ticket_vector_queue WHERE tenant_id=$1 AND ticket_id=$2",
        [ticket.tenant_id, ticket.ticket_id],
      );
      indexed += 1;
    } catch (error) {
      await pool.query(
        `UPDATE ticket_vector_queue
         SET attempts=attempts+1, last_error=$3,
             queued_at=now()+make_interval(secs=>LEAST(3600, POWER(2, LEAST(attempts, 10))::int))
         WHERE tenant_id=$1 AND ticket_id=$2`,
        [ticket.tenant_id, ticket.ticket_id, error instanceof Error ? error.message.slice(0, 1000) : "Indexing failed"],
      );
    }
  }

  return { escalations, indexed, queued: queued.rows.length };
}

export async function GET(request: NextRequest) {
  if (!validCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await tick(null));
  } catch (error) {
    console.error("scheduled worker failed", error);
    return NextResponse.json({ error: "Scheduled worker failed" }, { status: 500 });
  }
}

export async function POST() {
  const session = await getSession();
  if (!session || !["ADMIN", "AGENT"].includes(session.role)) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  try {
    return NextResponse.json(await tick(session.tenantId));
  } catch (error) {
    console.error("interactive worker failed", error);
    return NextResponse.json({ error: "Background work could not run" }, { status: 500 });
  }
}
