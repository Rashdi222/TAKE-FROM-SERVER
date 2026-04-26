"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import * as React from "react";

let clientSingleton: QueryClient | null = null;

function getClient() {
  if (!clientSingleton) {
    clientSingleton = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 10_000,
          retry: 1,
          refetchOnWindowFocus: false,
        },
      },
    });
  }
  return clientSingleton;
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(getClient);

  return (
    <QueryClientProvider client={client}>
      {children}
      {process.env.NODE_ENV === "development" ? <ReactQueryDevtools initialIsOpen={false} /> : null}
    </QueryClientProvider>
  );
}

