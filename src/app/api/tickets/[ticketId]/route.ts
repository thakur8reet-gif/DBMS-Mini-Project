import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  statusId: z.number().int().positive().optional(),
  assigneeId: z.number().int().positive().nullable().optional(),
  comment: z.string().trim().max(5000).optional(),
  internal: z.boolean().default(false),
}).refine((value) => value.statusId !== undefined || value.assigneeId !== undefined || Boolean(value.comment), {
  message: "Choose a ticket update or enter a comment",
});

async function ensureActivitySchema() {
  await pool.query(`CREATE TABLE IF NOT EXISTS ticket_activity (
    activity_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    ticket_id BIGINT NOT NULL,
    actor_user_id BIGINT,
    event_type VARCHAR(32) NOT NULL CHECK (event_type IN ('STATUS_CHANGED','ASSIGNED','COMMENT_ADDED')),
    previous_value TEXT,
    new_value TEXT,
    detail TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (tenant_id,ticket_id) REFERENCES ticket(tenant_id,ticket_id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id,actor_user_id) REFERENCES app_user(tenant_id,user_id) ON DELETE SET NULL (actor_user_id)
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ticket_activity_timeline
    ON ticket_activity(tenant_id,ticket_id,created_at DESC)`);
  await pool.query(`INSERT INTO ticket_status(tenant_id,name,is_closed_status)
    SELECT tenant_id,'In Progress',false FROM tenant ON CONFLICT (tenant_id,name) DO NOTHING`);
  await pool.query(`INSERT INTO ticket_status(tenant_id,name,is_closed_status)
    SELECT tenant_id,'Closed',true FROM tenant ON CONFLICT (tenant_id,name) DO NOTHING`);
}

type Context = { params: Promise<{ ticketId: string }> };

export async function GET(_request: NextRequest, { params }: Context) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!["ADMIN", "AGENT"].includes(session.role)) return NextResponse.json({ error: "Insufficient role" }, { status: 403 });
  const ticketId = Number((await params).ticketId);
  if (!Number.isSafeInteger(ticketId) || ticketId < 1) return NextResponse.json({ error: "Invalid ticket ID" }, { status: 400 });
  try {
    await ensureActivitySchema();
    const [ticketResult, statusesResult, agentsResult, commentsResult, activityResult] = await Promise.all([
      pool.query(`SELECT v.ticket_id,v.subject,t.description,v.customer_name,v.priority_name,t.status_id,v.status_name,
        v.assignee_name,t.assigned_to,v.created_at,v.updated_at,v.response_due_at,v.resolution_due_at,
        v.first_response_at,v.response_breached,v.resolution_breached,t.resolved_at,t.closed_at
        FROM v_ticket_operations v JOIN ticket t ON (t.tenant_id,t.ticket_id)=(v.tenant_id,v.ticket_id)
        WHERE v.tenant_id=$1 AND v.ticket_id=$2`, [session.tenantId, ticketId]),
      pool.query(`SELECT status_id,name,is_closed_status FROM ticket_status WHERE tenant_id=$1 ORDER BY
        CASE name WHEN 'Open' THEN 1 WHEN 'In Progress' THEN 2 WHEN 'Resolved' THEN 3 WHEN 'Closed' THEN 4 ELSE 5 END,name`, [session.tenantId]),
      pool.query(`SELECT u.user_id,u.name,r.role_name FROM app_user u JOIN app_role r
        ON (r.tenant_id,r.role_id)=(u.tenant_id,u.role_id)
        WHERE u.tenant_id=$1 AND u.is_active AND r.role_name IN ('ADMIN','AGENT') ORDER BY u.name`, [session.tenantId]),
      pool.query(`SELECT c.comment_id,c.comment_text,c.is_internal,c.created_at,u.name AS author_name
        FROM ticket_comment c LEFT JOIN app_user u ON (u.tenant_id,u.user_id)=(c.tenant_id,c.user_id)
        WHERE c.tenant_id=$1 AND c.ticket_id=$2 ORDER BY c.created_at DESC`, [session.tenantId, ticketId]),
      pool.query(`SELECT a.activity_id,a.event_type,a.previous_value,a.new_value,a.detail,a.created_at,u.name AS actor_name
        FROM ticket_activity a LEFT JOIN app_user u ON (u.tenant_id,u.user_id)=(a.tenant_id,a.actor_user_id)
        WHERE a.tenant_id=$1 AND a.ticket_id=$2 ORDER BY a.created_at DESC LIMIT 100`, [session.tenantId, ticketId]),
    ]);
    if (!ticketResult.rowCount) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    const normalize = (rows: Record<string, unknown>[]) => rows.map((row) => Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, typeof value === "string" && /_id$/.test(key) && /^\d+$/.test(value) ? Number(value) : value]),
    ));
    return NextResponse.json({
      ticket: normalize(ticketResult.rows)[0], statuses: normalize(statusesResult.rows),
      agents: normalize(agentsResult.rows), comments: normalize(commentsResult.rows), activity: normalize(activityResult.rows),
    });
  } catch (error) {
    console.error("ticket detail failed", error);
    return NextResponse.json({ error: "Unable to retrieve ticket details" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: Context) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!["ADMIN", "AGENT"].includes(session.role)) return NextResponse.json({ error: "Insufficient role" }, { status: 403 });
  const ticketId = Number((await params).ticketId);
  if (!Number.isSafeInteger(ticketId) || ticketId < 1) return NextResponse.json({ error: "Invalid ticket ID" }, { status: 400 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid update" }, { status: 400 });
  const data = parsed.data;
  if (data.internal && data.comment && session.role === "CUSTOMER") return NextResponse.json({ error: "Customers cannot add internal notes" }, { status: 403 });
  const client = await pool.connect();
  try {
    await ensureActivitySchema();
    await client.query("BEGIN");
    const current = await client.query(`SELECT t.status_id,t.assigned_to,s.name AS status_name,u.name AS assignee_name
      FROM ticket t JOIN ticket_status s ON (s.tenant_id,s.status_id)=(t.tenant_id,t.status_id)
      LEFT JOIN app_user u ON (u.tenant_id,u.user_id)=(t.tenant_id,t.assigned_to)
      WHERE t.tenant_id=$1 AND t.ticket_id=$2 FOR UPDATE OF t`, [session.tenantId, ticketId]);
    if (!current.rowCount) throw new Error("TICKET_NOT_FOUND");
    const old = current.rows[0];
    if (data.statusId !== undefined) {
      const target = await client.query(`SELECT status_id,name,is_closed_status FROM ticket_status WHERE tenant_id=$1 AND status_id=$2`, [session.tenantId, data.statusId]);
      if (!target.rowCount) throw new Error("INVALID_STATUS");
      if (Number(old.status_id) !== data.statusId) {
        const name = String(target.rows[0].name);
        const closed = Boolean(target.rows[0].is_closed_status);
        const resolved = /resolved|closed/i.test(name) || closed;
        await client.query(`UPDATE ticket SET status_id=$3,
          resolved_at=CASE WHEN $4 THEN COALESCE(resolved_at,now()) ELSE NULL END,
          closed_at=CASE WHEN $5 THEN COALESCE(closed_at,now()) ELSE NULL END
          WHERE tenant_id=$1 AND ticket_id=$2`, [session.tenantId, ticketId, data.statusId, resolved, /closed/i.test(name)]);
        await client.query(`UPDATE sla_tracking SET resolved_at=CASE WHEN $3 THEN COALESCE(resolved_at,now()) ELSE NULL END
          WHERE tenant_id=$1 AND ticket_id=$2`, [session.tenantId, ticketId, resolved]);
        await client.query(`INSERT INTO ticket_activity(tenant_id,ticket_id,actor_user_id,event_type,previous_value,new_value)
          VALUES($1,$2,$3,'STATUS_CHANGED',$4,$5)`, [session.tenantId, ticketId, session.userId, old.status_name, name]);
      }
    }
    if (data.assigneeId !== undefined && (old.assigned_to === null ? null : Number(old.assigned_to)) !== data.assigneeId) {
      let assigneeName: string | null = null;
      if (data.assigneeId !== null) {
        const assignee = await client.query(`SELECT u.name FROM app_user u JOIN app_role r ON (r.tenant_id,r.role_id)=(u.tenant_id,u.role_id)
          WHERE u.tenant_id=$1 AND u.user_id=$2 AND u.is_active AND r.role_name IN ('ADMIN','AGENT')`, [session.tenantId, data.assigneeId]);
        if (!assignee.rowCount) throw new Error("INVALID_ASSIGNEE");
        assigneeName = assignee.rows[0].name;
      }
      await client.query("UPDATE ticket SET assigned_to=$3 WHERE tenant_id=$1 AND ticket_id=$2", [session.tenantId, ticketId, data.assigneeId]);
      await client.query(`INSERT INTO ticket_activity(tenant_id,ticket_id,actor_user_id,event_type,previous_value,new_value)
        VALUES($1,$2,$3,'ASSIGNED',$4,$5)`, [session.tenantId, ticketId, session.userId, old.assignee_name || "Unassigned", assigneeName || "Unassigned"]);
    }
    if (data.comment) {
      const comment = await client.query(`INSERT INTO ticket_comment(tenant_id,ticket_id,user_id,comment_text,is_internal)
        VALUES($1,$2,$3,$4,$5) RETURNING comment_id`, [session.tenantId, ticketId, session.userId, data.comment, data.internal]);
      await client.query(`INSERT INTO ticket_activity(tenant_id,ticket_id,actor_user_id,event_type,detail)
        VALUES($1,$2,$3,'COMMENT_ADDED',$4)`, [session.tenantId, ticketId, session.userId, data.internal ? "Added an internal note" : "Added a reply"]);
      await client.query("SELECT fn_record_first_response($1,$2)", [session.tenantId, ticketId]);
      await client.query("UPDATE ticket SET updated_at=now() WHERE tenant_id=$1 AND ticket_id=$2", [session.tenantId, ticketId]);
      void comment;
    }
    await client.query("COMMIT");
    return NextResponse.json({ updated: true });
  } catch (error) {
    await client.query("ROLLBACK");
    const message = error instanceof Error ? error.message : "Unable to update ticket";
    const status = message === "TICKET_NOT_FOUND" ? 404 : ["INVALID_STATUS", "INVALID_ASSIGNEE"].includes(message) ? 400 : 500;
    return NextResponse.json({ error: status === 500 ? "Unable to update ticket" : message.replaceAll("_", " ").toLowerCase() }, { status });
  } finally {
    client.release();
  }
}
