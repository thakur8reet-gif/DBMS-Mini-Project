import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { getSession } from "@/lib/session";
export const dynamic="force-dynamic";
const createSchema=z.object({subject:z.string().trim().min(4).max(200),description:z.string().trim().min(10).max(10000),category:z.string().trim().min(1).max(80).default("Technical Support"),priority:z.string().trim().min(1).max(30).default("High"),customerEmail:z.string().email().max(120).optional(),customerName:z.string().trim().min(1).max(100).optional()});
export async function GET(){
 const session=await getSession();if(!session)return NextResponse.json({error:"Authentication required"},{status:401});
 try{const {rows}=await pool.query("SELECT ticket_id,subject,customer_name,priority_name,status_name,assignee_name,created_at,resolution_breached FROM v_ticket_operations WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 200",[session.tenantId]);return NextResponse.json({tickets:rows});}
 catch(error){console.error("ticket list failed",error);return NextResponse.json({error:"Unable to retrieve tickets"},{status:500});}
}
export async function POST(req:NextRequest){
 const session=await getSession();if(!session)return NextResponse.json({error:"Authentication required"},{status:401});
 if(!["ADMIN","AGENT"].includes(session.role))return NextResponse.json({error:"Insufficient role"},{status:403});
 const parsed=createSchema.safeParse(await req.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0]?.message||"Invalid input"},{status:400});
 const data=parsed.data, client=await pool.connect();
 try{
  await client.query("BEGIN");
  const email=data.customerEmail||session.email;
  const customer=await client.query(`INSERT INTO customer(tenant_id,name,email) VALUES($1,$2,$3)
    ON CONFLICT(tenant_id,email) DO UPDATE SET name=COALESCE(NULLIF(EXCLUDED.name,''),customer.name)
    RETURNING customer_id`,[session.tenantId,data.customerName||email,email]);
  const refs=await client.query(`SELECT c.category_id,p.priority_id,s.status_id,sp.sla_policy_id,
    sp.response_time_minutes,sp.resolution_time_minutes
    FROM category c JOIN priority p ON p.tenant_id=c.tenant_id
    JOIN ticket_status s ON s.tenant_id=c.tenant_id
    JOIN sla_policy sp ON (sp.tenant_id,sp.category_id,sp.priority_id)=(c.tenant_id,c.category_id,p.priority_id)
    WHERE c.tenant_id=$1 AND c.name=$2 AND p.name=$3 AND s.name='Open'`,[session.tenantId,data.category,data.priority]);
  if(!refs.rowCount)throw new Error("Tenant SLA configuration missing for selected category and priority");
  const ref=refs.rows[0];
  const ticket=await client.query(`INSERT INTO ticket(tenant_id,customer_id,category_id,priority_id,status_id,created_by,subject,description)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ticket_id`,[session.tenantId,customer.rows[0].customer_id,ref.category_id,ref.priority_id,ref.status_id,session.userId,data.subject,data.description]);
  await client.query(`INSERT INTO sla_tracking(tenant_id,ticket_id,sla_policy_id,response_due_at,resolution_due_at)
    VALUES($1,$2,$3,now()+make_interval(mins=>$4),now()+make_interval(mins=>$5))`,[session.tenantId,ticket.rows[0].ticket_id,ref.sla_policy_id,ref.response_time_minutes,ref.resolution_time_minutes]);
  await client.query("COMMIT");
  return NextResponse.json({ticketId:ticket.rows[0].ticket_id},{status:201});
 }catch(error){await client.query("ROLLBACK");const message=error instanceof Error?error.message:"Ticket creation failed";return NextResponse.json({error:message.includes("configuration missing")?message:"Unable to create ticket"},{status:message.includes("configuration missing")?422:500});}
 finally{client.release();}
}
