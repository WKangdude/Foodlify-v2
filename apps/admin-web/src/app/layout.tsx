import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Administración · Foodlify", description: "Tu negocio, tu equipo y tus sucursales en un solo lugar." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="es"><body>{children}</body></html>; }
