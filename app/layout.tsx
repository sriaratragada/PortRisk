import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Playfair_Display, Sora } from "next/font/google";
import "./globals.css";

const playfair = Playfair_Display({
  subsets: ["latin"],
  style: ["italic", "normal"],
  weight: ["600", "700"],
  variable: "--font-playfair"
});

const sora = Sora({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-sora"
});

export const metadata: Metadata = {
  title: "Portfolio Risk & Compliance Engine",
  description: "Realtime multi-asset portfolio risk scoring, stress testing, and audit logging."
};

export default function RootLayout({
  children
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${playfair.variable} ${sora.variable}`}>
      <body>{children}</body>
    </html>
  );
}
