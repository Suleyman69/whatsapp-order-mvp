import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hatırlat Bana",
  description: "Sesle hızlı hatırlatma ekle, zamanı gelince bildirim al.",
  applicationName: "Hatırlat Bana",
  appleWebApp: { capable: true, title: "Hatırlat Bana", statusBarStyle: "default" },
  formatDetection: { telephone: false, date: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0f" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="tr" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
