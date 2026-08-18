import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

const description = "Local-first anatomical branching graph editor and node-shift scoring tool.";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const image = new URL("/og.png", `${protocol}://${host}`).toString();
  return {
    title: "BranchTopo",
    description,
    openGraph: { title: "BranchTopo", description, images: [image] },
    twitter: { card: "summary_large_image", title: "BranchTopo", description, images: [image] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
