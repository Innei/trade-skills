import { useEffect, useState, type ComponentType } from 'react';
import { ensureProEdition } from './proEditionRegistry';

export function useProSlot<P = Record<string, unknown>>(slotId: string): ComponentType<P> | null {
  const [Component, setComponent] = useState<ComponentType<P> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setComponent(null);

    void (async () => {
      const handle = await ensureProEdition();
      if (cancelled || !handle) return;

      const loadComponent = handle.slots.get(slotId);
      if (!loadComponent) return;

      const mod = await loadComponent();
      if (cancelled) return;

      setComponent(() => mod.default as ComponentType<P>);
    })();

    return () => {
      cancelled = true;
    };
  }, [slotId]);

  return Component;
}
