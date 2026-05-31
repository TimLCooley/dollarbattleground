import type { Metadata, Viewport } from "next";
import { Anton, IBM_Plex_Mono, Roboto_Slab } from "next/font/google";
import "./globals.css";
import { DevPicker } from "@/components/dev-picker";

const anton = Anton({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "400",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const robotoSlab = Roboto_Slab({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "Political Battleground",
  description: "One dollar. One square. Two Americas.",
};

export const viewport: Viewport = {
  themeColor: "#0B0B0C",
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
      className={`${anton.variable} ${plexMono.variable} ${robotoSlab.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-white font-body text-neutral-900">
        {children}
        {process.env.NODE_ENV !== "production" && <DevPicker />}
      </body>
    </html>
  );
}
