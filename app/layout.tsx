import type { Metadata, Viewport } from "next";
import { Ubuntu_Mono } from "next/font/google";
import { siteUrl } from "@/lib/site";
import "./globals.css";

// Autoalojada en el build por next/font: ningún origen de fuentes de terceros en la CSP.
// Ubuntu Mono, la de las terminales Linux, para todo el sitio público.
const mono = Ubuntu_Mono({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-mono-family", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  robots: { index: true, follow: true },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  themeColor: "#f5f8f6",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={mono.variable}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
