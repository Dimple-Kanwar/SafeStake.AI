import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import Image from "next/image";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "SafeStake.AI - Cross-Chain AI Staking",
  description: "AI-powered cross-chain staking platform enabling seamless multi-chain DeFi yield optimization",
  icons: {
    icon: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>
          {/* Header with Logo */}
          <header className="fixed top-0 left-0 right-0 z-50 bg-white/10 backdrop-blur-lg border-b border-white/20">
            <div className="container mx-auto px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* Logo */}
                <div className="relative w-100 h-100 rounded-lg overflow-hidden bg-gradient-to-br p-2">
                  <div className="relative w-10 h-10">
                    <Image
                      src="/logo.png"
                      alt="SafeStake.AI Logo"
                      fill
                      className="object-contain"
                    />
                  </div>
                </div>


                <div>
                  <h1 className="text-xl font-bold text-white">SafeStake.AI</h1>
                  <p className="text-xs text-white/70">Cross-Chain AI Staking</p>
                </div>
              </div>
            </div>
          </header>

          {/* Main Content with top padding for fixed header */}
          <main className="pt-20 min-h-screen">
            {children}
          </main>

          {/* Footer */}
          <footer className="bg-white/10 backdrop-blur-lg border-t border-white/20 py-6 mt-12">
            <div className="container mx-auto px-4 text-center">
              <div className="flex items-center justify-center gap-4 mt-2">
                <span className="text-white/30">Made in ethOnline2025</span>
              </div>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
