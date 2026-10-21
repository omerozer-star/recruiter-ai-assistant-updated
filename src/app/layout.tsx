import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Recruiter AI Assistant",
  description: "עוזר AI חכם לסורסינג והפצת משרות",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body className="min-h-screen bg-slate-50 text-slate-900">
        <nav className="bg-white border-b border-slate-200 sticky top-0 z-10">
          <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-6">
            <Link href="/" className="font-bold text-indigo-600 text-lg">
              🎯 Recruiter AI
            </Link>
            <Link href="/" className="text-sm hover:text-indigo-600">
              דשבורד
            </Link>
            <Link href="/jobs" className="text-sm hover:text-indigo-600">
              משרות
            </Link>
            <Link href="/communities" className="text-sm hover:text-indigo-600">
              קהילות
            </Link>
            <div className="mr-auto">
              <Link
                href="/jobs/new"
                className="bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-indigo-700"
              >
                + משרה חדשה
              </Link>
            </div>
          </div>
          <div className="border-t border-slate-100 bg-white px-4 py-1 text-center text-xs font-medium text-slate-600">
            Created by Omer Ozer
          </div>
        </nav>
        <main className="max-w-6xl mx-auto px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
