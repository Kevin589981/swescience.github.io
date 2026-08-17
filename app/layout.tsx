import type { Metadata } from "next";
import { benchmarkData } from "@/lib/benchmark";
import "./globals.css";

const title = "SWE-bench Science — Leaderboard";
const description = `A repository-level benchmark for scientific software engineering across ${benchmarkData.summary.tasks} tasks, ${benchmarkData.summary.repositories} repositories, and ${benchmarkData.summary.domains} scientific domains.`;
const themeScript = `(function(){try{var stored=localStorage.getItem("swe-science-theme");var theme=stored==="light"||stored==="dark"?stored:(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.dataset.theme=theme}catch(error){document.documentElement.dataset.theme="light"}})();`;
const [repositoryOwner = "OpenMOSS", repositoryName = "SWE-bench-Science"] = (process.env.GITHUB_REPOSITORY ?? "OpenMOSS/SWE-bench-Science").split("/");
const isGitHubPagesBuild = process.env.GITHUB_ACTIONS === "true";
const isAccountSite = repositoryName.endsWith(".github.io");
const pagesPath = isGitHubPagesBuild && !isAccountSite ? `/${repositoryName}` : "";
const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? (isGitHubPagesBuild ? `https://${repositoryOwner.toLowerCase()}.github.io${pagesPath}/` : "http://localhost:3000/"));
const imageUrl = new URL("og.png", siteUrl).toString();

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title,
  description,
  openGraph: {
    title,
    description,
    type: "website",
    images: [{ url: imageUrl, width: 1736, height: 909, alt: "SWE-bench Science leaderboard" }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [imageUrl],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
