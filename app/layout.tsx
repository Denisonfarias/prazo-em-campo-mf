import type { Metadata } from "next";
import { Fraunces, Source_Sans_3 } from "next/font/google";

import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const sans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-app-sans",
});

const heading = Fraunces({
  subsets: ["latin"],
  variable: "--font-app-heading",
});

export const metadata: Metadata = {
  title: "Prazo em Campo",
  description: "Vencimentos de serviço e aviso no WhatsApp uma hora antes do prazo.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${sans.variable} ${heading.variable} h-full antialiased`}>
      <body className="min-h-full bg-background text-foreground">
        {children}
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
