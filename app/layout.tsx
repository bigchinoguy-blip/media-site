import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "2.0",
  description: "2.0 multimedia workspace for Craig",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
