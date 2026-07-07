import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppChrome } from "@/components/AppChrome";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Görsel Şablon Stüdyosu",
  description: "Şablon oluşturma ve doldurma aracı",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const themeBootstrap = `
(function(){
  try {
    var t = localStorage.getItem('teklif-theme');
    var dark = t === null || t === '' ? true : (t === 'dark');
    document.documentElement.classList.toggle('dark', dark);
  } catch (e) {
    document.documentElement.classList.add('dark');
  }
})();`;

  return (
    <html lang="tr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans text-foreground bg-background`}
      >
        <AppChrome>{children}</AppChrome>
        <span
          className="pointer-events-none fixed bottom-4 right-4 z-[9999] text-xs tracking-wide text-foreground opacity-50"
          aria-hidden
        >
          made by Taha Kara
        </span>
      </body>
    </html>
  );
}
