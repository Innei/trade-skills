import { useEffect, useState } from "react";

export function useHashRoute(): string {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  const route = hash.replace(/^#/, "");
  return route || "/";
}

export function navigate(route: string): void {
  window.location.hash = route;
}
