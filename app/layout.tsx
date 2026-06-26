import type { Metadata, Viewport } from "next";
import { Geist, Fraunces } from "next/font/google";
import "./globals.css";

// Label voice — navigation, how you move through Grove.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

// The voice — what Grove says to you. Fraunces: a warm display serif with
// presence. Used only for the serif voice, nowhere else.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Grove",
  description: "A place you enter, not a screen you check.",
  applicationName: "Grove",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Grove",
  },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // draw under the notch / home indicator
  themeColor: "#f6f8f4",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="flex min-h-dvh flex-col">{children}</body>
    </html>
  );
}
