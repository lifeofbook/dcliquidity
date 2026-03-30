import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DCLiquidity — Solana DEX Liquidity Depth",
  description: "Visualize support and resistance levels from concentrated liquidity across all major Solana DEXes",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
