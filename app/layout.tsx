import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "The Gallery",
  description: "The Gallery multimedia workspace for Craig",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
