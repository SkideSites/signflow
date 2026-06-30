import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { type ReactNode } from "react";

import appCss from "../styles.css?url";
import { AuthProvider } from "@/hooks/use-auth";
import { WorkspaceProvider } from "@/hooks/use-workspace";
import { Toaster } from "@/components/ui/sonner";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1" },
      { title: "Signflow — Daily Execution OS" },
      { name: "description", content: "Know exactly what to do every day to close more deals. No CRM complexity. Just execution." },
      { name: "theme-color", content: "#1c1d20" },
      { property: "og:title", content: "Signflow — Daily Execution OS" },
      { property: "og:description", content: "Know exactly what to do every day to close more deals. No CRM complexity. Just execution." },
      { name: "twitter:title", content: "Signflow — Daily Execution OS" },
      { name: "twitter:description", content: "Know exactly what to do every day to close more deals. No CRM complexity. Just execution." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/IdJIiGlbiFVtNuCMBGJPlA6B83q2/social-images/social-1782782241135-ChatGPT_Image_30_juin_2026_à_03_08_39.webp" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/IdJIiGlbiFVtNuCMBGJPlA6B83q2/social-images/social-1782782241135-ChatGPT_Image_30_juin_2026_à_03_08_39.webp" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/icon.png", type: "image/png" },
      { rel: "apple-touch-icon", href: "/icon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head><HeadContent /></head>
      <body className="bg-background text-foreground">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <WorkspaceProvider>
          <Outlet />
          <Toaster theme="dark" position="top-right" />
        </WorkspaceProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
