import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import { SolanaProvider } from "@/components/SolanaProvider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const doto = localFont({
  src: "../../public/fonts/doto.woff2",
  variable: "--font-doto",
  display: "swap",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "apsis",
  description:
    "Pay someone and recover the SOL locked in your empty token accounts.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${doto.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#0C0C0B] text-[#EDEDEC] selection:bg-[#FF5A1F]/30 selection:text-white">
        <SolanaProvider>
          {children}
          <Toaster />
        </SolanaProvider>
      </body>
    </html>
  );
}
