import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import bcrypt from "bcryptjs";
import {SignJWT} from "jose";
import {pool} from "@/lib/db";
const schema=z.object({email:z.string().email().max(120),password:z.string().min(8).max(200)});
export async function POST(req:NextRequest){
 if(!process.env.AUTH_SECRET)return NextResponse.json({error:"AUTH_SECRET is not configured"},{status:503});
 const parsed=schema.safeParse(await req.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:"Valid email and password are required"},{status:400});
 const {email,password}=parsed.data;
 try{
  const {rows}=await pool.query(`SELECT u.user_id,u.tenant_id,u.email,u.password_hash,r.role_name
   FROM app_user u JOIN app_role r ON (r.tenant_id,r.role_id)=(u.tenant_id,u.role_id)
   JOIN tenant t ON t.tenant_id=u.tenant_id
   WHERE lower(u.email)=lower($1) AND u.is_active AND t.is_active LIMIT 1`,[email]);
  const user=rows[0];if(!user||!(await bcrypt.compare(password,user.password_hash)))return NextResponse.json({error:"Invalid credentials"},{status:401});
  const token=await new SignJWT({userId:Number(user.user_id),tenantId:Number(user.tenant_id),role:user.role_name,email:user.email})
   .setProtectedHeader({alg:"HS256"}).setIssuedAt().setExpirationTime("8h").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  const response=NextResponse.json({user:{email:user.email,role:user.role_name}});
  response.cookies.set("resolveiq_session",token,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:8*60*60});
  return response;
 }catch(error){console.error("login failed",error);return NextResponse.json({error:"Authentication service unavailable"},{status:500});}
}
