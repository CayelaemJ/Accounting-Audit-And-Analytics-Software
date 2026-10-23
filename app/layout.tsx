import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "CABO Financial Intelligence",
  description: "A secure financial workspace for accounting, audit and management reporting."
};
export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="en-ZA"><body>{children}</body></html>;
}
