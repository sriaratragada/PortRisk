import type { Metadata } from "next";
import { Manrope, JetBrains_Mono } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const sansFont = Manrope({
  subsets: ["latin"],
  variable: "--font-sans"
});

const monoFont = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono"
});

export const metadata: Metadata = {
  title: "Portfolio Risk & Compliance Engine",
  description: "Realtime multi-asset portfolio risk scoring, stress testing, and audit logging."
};

export default function RootLayout({
  children
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${sansFont.variable} ${monoFont.variable}`}>{children}</body>
    </html>
  );
}
