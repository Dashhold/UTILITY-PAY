import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: siteConfig.legalName,
    short_name: siteConfig.name,
    description: siteConfig.description,
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#FFC72C",
    icons: [
      {
        src: siteConfig.logo,
        sizes: "any",
        type: "image/jpeg",
      },
    ],
  };
}
