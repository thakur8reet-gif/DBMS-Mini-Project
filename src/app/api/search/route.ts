import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {getSession} from "@/lib/session";
import {pool} from "@/lib/db";
const schema=z.object({query:z.string().trim().min(3).max(2000),limit:z.number().int().min(1).max(20).default(5)});
export async function POST(req:NextRequest){
 const session=await getSession();if(!session)return NextResponse.json({error:"Authentication required"},{status:401});
 const parsed=schema.safeParse(await req.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:"Invalid search query"},{status:400});
 const endpoint=process.env.SEMANTIC_SEARCH_URL;if(!endpoint)return NextResponse.json({error:"Semantic search service is not configured"},{status:503});
 try{
  const response=await fetch(new URL("/search",endpoint),{method:"POST",headers:{"Content-Type":"application/json",...(process.env.SEMANTIC_INTERNAL_TOKEN?{"x-internal-token":process.env.SEMANTIC_INTERNAL_TOKEN}:{})},body:JSON.stringify({tenant_id:session.tenantId,query:parsed.data.query,limit:parsed.data.limit}),cache:"no-store"});
  if(!response.ok)throw new Error("Vector service unavailable");
  const data=await response.json() as {results:{ticket_id:number;score:number}[]};
  const ids=data.results.map(x=>x.ticket_id);if(!ids.length)return NextResponse.json({results:[]});
  const {rows}=await pool.query("SELECT ticket_id,subject,customer_name,priority_name,status_name FROM v_ticket_operations WHERE tenant_id=$1 AND ticket_id=ANY($2::bigint[])",[session.tenantId,ids]);
  const byId=new Map(rows.map((r:any)=>[Number(r.ticket_id),r]));
  return NextResponse.json({results:data.results.flatMap(x=>byId.has(x.ticket_id)?[{...byId.get(x.ticket_id),score:x.score}]:[])});
 }catch{return NextResponse.json({error:"Semantic search is temporarily unavailable"},{status:503});}
}
