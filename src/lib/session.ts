import { cookies } from "next/headers";
import { jwtVerify } from "jose";
export type Session = { userId:number; tenantId:number; role:string; email:string };
export async function getSession():Promise<Session|null>{
 const token=(await cookies()).get("resolveiq_session")?.value;
 if(!token||!process.env.AUTH_SECRET)return null;
 try{const key=new TextEncoder().encode(process.env.AUTH_SECRET);const {payload}=await jwtVerify(token,key);
  if(typeof payload.userId!=="number"||typeof payload.tenantId!=="number"||typeof payload.role!=="string"||typeof payload.email!=="string")return null;
  return {userId:payload.userId,tenantId:payload.tenantId,role:payload.role,email:payload.email};
 }catch{return null;}
}
