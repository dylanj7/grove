import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Grove",
    short_name: "Grove",
    description: "A place you enter, not a screen you check.",
    start_url: "/grove",
    display: "standalone",
    background_color: "#f6f8f4",
    theme_color: "#f6f8f4",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
