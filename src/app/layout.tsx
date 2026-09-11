import type { Metadata, Viewport } from "next";
import { Silkscreen, Schoolbell } from "next/font/google";
import "./globals.css";

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

export const metadata: Metadata = {
  title: "Dollar Battleground",
  description: "One dollar. One tile. Turn the whole board your color.",
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
      <body>{children}</body>
    </html>
  );
}
