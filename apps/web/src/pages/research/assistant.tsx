import { useProRoutes } from '@web/features/edition/useProRoutes';
import { ResearchAssistantPage } from '@web/features/research/ResearchAssistantPage';

export function Component() {
  const { status, routes } = useProRoutes();
  if (status === 'loading') return null;
  const ProAssistant = routes?.['/research/assistant'];
  if (ProAssistant) return <ProAssistant />;
  return <ResearchAssistantPage />;
}
