import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";
import { SiteHeader } from "@/components/SiteHeader";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "LendLoop · Borrow what you need. Lend what you don't.",
  description: "A neighborhood board for lending and borrowing tools.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
        <body className="flex min-h-full flex-col bg-stone-50 text-stone-900">
          <ConvexClientProvider>
            <SiteHeader />
            <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">{children}</main>
            <footer className="border-t border-stone-200 py-6 text-center text-xs text-stone-500">
              LendLoop is a fictional demo. Borrow what you need. Lend what you don&apos;t.
            </footer>
          </ConvexClientProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
