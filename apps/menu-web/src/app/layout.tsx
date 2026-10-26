import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Menú | Foodlify",
  description:
    "Descubre el menú, personaliza tus platillos y prepara tu pedido desde tu mesa.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
