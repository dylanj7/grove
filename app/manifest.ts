import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Grove",
    short_name: "Grove",
    description: "A place you enter, not a screen you check.",
    start_url: "/home",
    display: "standalone",
    background_color: "#f6f8f4",
    theme_color: "#f6f8f4",
    // A long-press on the installed icon goes straight to capture. The sheet
    // opens on arrival via ?capture=1 — the same deep link the old /checkin
    // route now redirects to, so nothing that pointed at it is stranded.
    shortcuts: [
      {
        name: "Capture",
        short_name: "Capture",
        description: "Set down how you're doing",
        url: "/home?capture=1",
      },
      {
        name: "Rhythm",
        short_name: "Rhythm",
        description: "Your last fourteen days",
        url: "/rhythm",
      },
    ],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
