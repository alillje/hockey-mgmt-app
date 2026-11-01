import { useEffect, useState } from "react";
import { useLibrary } from "../App";

export function useContentLoader(kind: "drills" | "practices", id?: string) {
  const library = useLibrary();
  const key = `${library.organisation?.id}:${library.teamId}:${kind}:${id}:${library.contentVersion}`;
  const [result, setResult] = useState<{ key: string; error: string } | null>(
    null,
  );
  useEffect(() => {
    if (!id || library.loading) return;
    let active = true;
    void library.loadContent(kind, id).then(
      () => {
        if (active) setResult({ key, error: "" });
      },
      (reason) => {
        if (active)
          setResult({
            key,
            error:
              reason instanceof Error
                ? reason.message
                : "Could not load content.",
          });
      },
    );
    return () => {
      active = false;
    };
  }, [key, id, kind, library.loading, library.loadContent]);
  return {
    loading: !!id && result?.key !== key,
    error: id && result?.key === key ? result.error : "",
  };
}
