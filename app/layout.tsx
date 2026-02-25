import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "Dream — E2EE Chat",
    description: "End-to-end encrypted messaging and video calling",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    );
}
