import type { Metadata } from "next";
import { Syne, Space_Grotesk, Inter } from "next/font/google";
import "./globals.css";

const syne = Syne({
  subsets: ["latin"],
  weight: ["700", "800"],
  variable: "--font-syne",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Lifespan Matrix — Consumer Hardware Survival Analysis",
  description:
    "Live Kaplan-Meier survival analysis of budget consumer peripherals, updating as survey responses arrive.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${syne.variable} ${spaceGrotesk.variable} ${inter.variable}`}>
      <body className="bg-void">{children}</body>
    </html>
  );
}
