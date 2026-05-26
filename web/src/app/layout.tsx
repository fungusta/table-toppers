import type { Metadata } from "next";
import "../styles/base.css";
import "../styles/cafe.css";
import "../styles/catan.css";
import "../styles/carcassonne.css";
import "../styles/forms.css";
import "../styles/modals.css";

export const metadata: Metadata = {
  title: "TableToppers",
};

const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Caveat:wght@500;600;700&family=Cinzel:wght@500;600;700&family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600&family=Fraunces:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400;1,600&family=IBM+Plex+Mono:wght@400;500;600;700&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=IBM+Plex+Serif:wght@400;500;600&family=IM+Fell+English:ital@0;1&family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,600;1,700;1,800;1,900&family=Spectral:wght@400;500;600;700&display=swap";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={FONTS_HREF} />
      </head>
      <body className="theme-cafe font-serif intensity-full">{children}</body>
    </html>
  );
}
