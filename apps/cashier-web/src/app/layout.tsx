import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Caja · Foodlify",
  description:
    "Cuentas, cobros y turnos del restaurante. Demostración de Foodlify.",
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
