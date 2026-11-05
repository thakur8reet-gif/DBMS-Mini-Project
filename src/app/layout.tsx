import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "ResolveIQ", description: "Multi-tenant helpdesk and SLA intelligence" };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en"><body>{children}</body></html>; }
