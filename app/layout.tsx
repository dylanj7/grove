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
    statusBarStyle: "black-translucent",
    title: "Grove",
  },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // draw under the notch / home indicator
  // The browser chrome follows the theme too, so a dark Grove isn't framed by
  // a bright status bar.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f8f4" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1511" },
  ],
};

// Runs before first paint, so someone who pinned night mode never gets a white
// flash on load. It reads only its own key and writes one attribute; if storage
// is unavailable (private mode, blocked cookies) it does nothing and the OS
// preference governs — the correct fallback.
const THEME_SCRIPT = `try{var t=localStorage.getItem('grove-theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${fraunces.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-dvh flex-col">{children}</body>
    </html>
  );
}
