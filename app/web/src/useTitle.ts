import { useEffect } from "react";

const BRAND = "Kansoku";

export function useTitle(pageName: string | null | undefined): void {
  useEffect(() => {
    document.title = pageName ? `${pageName} · ${BRAND}` : BRAND;
  }, [pageName]);
}
