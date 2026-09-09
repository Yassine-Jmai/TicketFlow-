import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TicketFlow — Centre de contrôle",
  description: "Plateforme intelligente de gestion des tickets"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
