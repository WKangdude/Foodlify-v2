import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Salón · Foodlify",
  description: "Panel de hostess: mesas, visitas y operación del salón.",
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
