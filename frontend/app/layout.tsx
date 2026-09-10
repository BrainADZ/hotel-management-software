import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { PwaProvider } from "./pwa-provider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BrainADZ Hospitality OS",
  description:
    "A unified hotel, travel and operations platform with controlled offline billing continuity.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  manifest: "/manifest.webmanifest",
  openGraph: {
    title: "BrainADZ Hospitality OS",
    description:
      "Master Hub, hotel PMS, travel operations and restricted offline billing continuity.",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "BrainADZ Hospitality OS",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "BrainADZ Hospitality OS",
    description:
      "Master Hub, hotel PMS, travel operations and restricted offline billing continuity.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.variable}>
        <PwaProvider>{children}</PwaProvider>
      </body>
    </html>
  );
}
