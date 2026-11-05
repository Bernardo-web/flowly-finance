import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: { default: "Flowly", template: "%s · Flowly" },
  description: "Seu dinheiro, em fluxo e sob controle.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  appleWebApp: { capable: true, title: "Flowly", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#0f766e",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
