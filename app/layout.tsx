import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Silkscreen } from "next/font/google";
import "./globals.css";

const pixel = Silkscreen({ subsets: ["latin"], weight: ["400", "700"], variable: "--pixel" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--mono" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.PUBLIC_BASE_URL || "https://rare-friends-pass.vercel.app"),
  title: "Rare Friends Pass: your Friend, in your wallet",
  description:
    "An Apple and Google Wallet pass for every activated Rare Friend: live claimable, pending and backpack balances, with Claim and Withdraw right on the pass. Built on ERC-8426.",
  openGraph: { title: "Rare Friends Pass", description: "Your Friend, in your wallet. Claim and withdraw from the pass.", images: ["/api/art/genesis-292/hero.png"] },
  twitter: { card: "summary_large_image" },
};
export const viewport: Viewport = { themeColor: "#000000", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${pixel.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
