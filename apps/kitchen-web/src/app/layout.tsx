import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cocina · Foodlify",
  description: "Tu cocina en orden. Pedidos, estaciones y preparación en un solo lugar.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
