import type { Metadata, Viewport } from "next";
import { Silkscreen, Schoolbell } from "next/font/google";
import "./globals.css";
import { AdminReturn } from "@/components/admin-return";
import { VersionWatch } from "@/components/version-watch";
import { MetaPixel } from "@/components/meta-pixel";
import { FaviconSwitcher } from "@/components/favicon-switcher";

const silkscreen = Silkscreen({
  variable: "--font-pixel",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const schoolbell = Schoolbell({
  variable: "--font-hand",
  subsets: ["latin"],
  weight: "400",
});

const SITE_DESCRIPTION =
  "Play CommanderBG, a free daily strategy puzzle: place Archers and Soldiers to take the most ground. A new map every day, the same for everyone — plus Battle Ground, Red vs Blue on one live map.";

export const metadata: Metadata = {
  metadataBase: new URL("https://commanderbg.com"),
  title: "CommanderBG — a free daily strategy puzzle game",
  description: SITE_DESCRIPTION,
  applicationName: "CommanderBG",
  keywords: ["daily puzzle", "strategy puzzle", "daily strategy game", "puzzle game", "browser game", "free online game", "Commander", "CommanderBG", "red vs blue", "territory game"],
  openGraph: {
    type: "website",
    siteName: "CommanderBG",
    locale: "en_US",
    url: "/",
    title: "CommanderBG — a free daily strategy puzzle game",
    description: SITE_DESCRIPTION,
  },
  twitter: { card: "summary_large_image", title: "CommanderBG — a free daily strategy puzzle game", description: SITE_DESCRIPTION },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  themeColor: "#155f33",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${silkscreen.variable} ${schoolbell.variable} antialiased`}
    >
      <body>
        <FaviconSwitcher />
        {children}
        <AdminReturn />
        <VersionWatch />
        <MetaPixel />
      </body>
    </html>
  );
}
