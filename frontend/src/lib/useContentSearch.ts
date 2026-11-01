import { useEffect, useState } from "react";
import { useLibrary } from "../App";
import { api } from "./api";
import type { ContentPage, ContentQuery } from "./types";

export function useContentSearch(
  kind: "drills" | "practices",
  query: ContentQuery,
  revision = 0,
) {
  const library = useLibrary();
  const queryKey = JSON.stringify(query);
  const baseKey = `${library.organisation?.id}:${library.teamId}:${kind}:${queryKey}:${library.contentVersion}`;
  const key = `${baseKey}:${revision}`;
  const [result, setResult] = useState<{
    key: string;
    baseKey: string;
    data?: ContentPage;
    error: string;
  }>();
  useEffect(() => {
    if (library.loading || !library.organisation) return;
    const controller = new AbortController();
    void api
      .searchContent(
        kind,
        JSON.parse(queryKey) as ContentQuery,
        controller.signal,
      )
      .then(
        (data) => {
          if (!controller.signal.aborted)
            setResult({ key, baseKey, data, error: "" });
        },
        (reason) => {
          if (!controller.signal.aborted)
            setResult({
              key,
              baseKey,
              error:
                reason instanceof Error
                  ? reason.message
                  : "Could not search content.",
            });
        },
      );
    return () => controller.abort();
  }, [key, baseKey, queryKey, kind, library.loading, library.organisation]);
  return {
    loading: result?.key !== key,
    data: result?.baseKey === baseKey ? result.data : undefined,
    error: result?.key === key ? result.error : "",
  };
}

export function useDebouncedSearch(value: string) {
  const [search, setSearch] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(value), 200);
    return () => window.clearTimeout(timer);
  }, [value]);
  return search;
}
