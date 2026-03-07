import { useEffect } from "react";

type Options = {
  enabled?: boolean;
  onBlocked?: () => void;
};

export function useBlockBackNavigation(options?: Options): void {
  const enabled = options?.enabled ?? true;
  const onBlocked = options?.onBlocked;

  useEffect(() => {
    if (!enabled) return;

    const marker = { sts_guard: true, ts: Date.now() };
    window.history.pushState(marker, "", window.location.href);

    const onPopState = () => {
      window.history.pushState(marker, "", window.location.href);
      onBlocked?.();
    };

    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, [enabled, onBlocked]);
}
