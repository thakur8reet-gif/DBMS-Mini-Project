import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {getSession} from "@/lib/session";
import {pool} from "@/lib/db";
import {qdrantIsReachable,searchTickets} from "@/lib/qdrant";
const schema=z.object({query:z.string().trim().min(3).max(2000),limit:z.number().int().min(1).max(20).default(5)});
export const dynamic="force-dynamic";
export async function GET(){
 const configured=process.env.SEMANTIC_SEARCH_URL?true:await qdrantIsReachable();
 return NextResponse.json({configured});
}
export async function POST(req:NextRequest){
 const session=await getSession();if(!session)return NextResponse.json({error:"Authentication required"},{status:401});
 const parsed=schema.safeParse(await req.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:"Invalid search query"},{status:400});
 try{
  const endpoint=process.env.SEMANTIC_SEARCH_URL;
  let matches:{ticket_id:number;score:number}[];
  if(endpoint){
   const response=await fetch(new URL("/search",endpoint),{method:"POST",headers:{"Content-Type":"application/json",...(process.env.SEMANTIC_INTERNAL_TOKEN?{"x-internal-token":process.env.SEMANTIC_INTERNAL_TOKEN}:{})},body:JSON.stringify({tenant_id:session.tenantId,query:parsed.data.query,limit:parsed.data.limit}),cache:"no-store"});
   if(!response.ok)throw new Error("Semantic service unavailable");
   const data=await response.json() as {results:{ticket_id:number;score:number}[]};
   matches=data.results;
  }else{
   matches=await searchTickets(parsed.data.query,session.tenantId,parsed.data.limit);
  }
  const ids=matches.map(x=>x.ticket_id);if(!ids.length)return NextResponse.json({results:[]});
  type TicketSearchRow={ticket_id:number;subject:string;customer_name:string;priority_name:string;status_name:string};
  const {rows}=await pool.query<TicketSearchRow>("SELECT ticket_id,subject,customer_name,priority_name,status_name FROM v_ticket_operations WHERE tenant_id=$1 AND ticket_id=ANY($2::bigint[])",[session.tenantId,ids]);
  const byId=new Map(rows.map(row=>[Number(row.ticket_id),row]));
  return NextResponse.json({results:matches.flatMap(result=>{const row=byId.get(result.ticket_id);return row?[{...row,score:result.score}]:[]})});
 }catch{
  const configured=Boolean(process.env.SEMANTIC_SEARCH_URL||(process.env.QDRANT_URL&&process.env.QDRANT_API_KEY));
  return NextResponse.json({error:configured?"Semantic search is temporarily unavailable":"Semantic search is not configured on this deployment"},{status:503});
 }
}
