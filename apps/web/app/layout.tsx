import { Geist, Geist_Mono } from "next/font/google";

import "@workspace/ui/globals.css";
import { Providers } from "@/components/providers";
import { Header } from "@/components/header";
import { Sidebar } from "@/components/sidebar";
import { Separator } from "@workspace/ui/components/separator";

const fontSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
});

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${fontSans.variable} ${fontMono.variable} font-sans antialiased`}>
        <Providers>
          <div className="flex min-h-svh">
            {/* Desktop sidebar */}
            <aside className="hidden lg:flex lg:w-56 lg:flex-col lg:border-r">
              <div className="flex h-14 items-center px-4">
                <span className="text-lg font-semibold tracking-tight">LoanScope</span>
              </div>
              <Separator />
              <Sidebar className="flex-1" />
            </aside>

            {/* Main area */}
            <div className="flex flex-1 flex-col">
              <Header />
              <main className="flex-1 p-4 lg:p-6">{children}</main>
            </div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
