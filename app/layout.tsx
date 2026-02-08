import type { Metadata } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

const spaceGrostesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Portfolio - Wilson",
  description:
    "Desarrollador Full Stack y DevOps, creando soluciones innovadoras. ¡Explora mi portafolio y descubre lo que puedo hacer! 🚀",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body
        className={`bg-background-light dark:bg-background-dark font-display text-slate-800 dark:text-slate-200 selection:bg-primary selection:text-background-dark ${spaceGrostesk.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
