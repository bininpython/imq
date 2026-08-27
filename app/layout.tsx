import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IMIQ - Inspeção",
  description: "Fechamento profissional de relatórios de turno da Laminação a Frio Central.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  other: {
    "codex-preview": "development",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
