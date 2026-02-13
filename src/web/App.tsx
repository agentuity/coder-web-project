import { NewSessionDialog } from './components/sessions/NewSessionDialog';
import { AppShell } from './components/shell/AppShell';
import { useAppContext } from './context/AppContext';

export function AppLayout() {
  const {
    showNewDialog,
    closeNewSessionDialog,
    handleNewSession,
    isCreating,
    githubAvailable,
    workspaceId,
  } = useAppContext();

  return (
    <>
      <AppShell />
      <NewSessionDialog
        isOpen={showNewDialog}
        onClose={closeNewSessionDialog}
        onCreate={handleNewSession}
        isCreating={isCreating}
        githubAvailable={githubAvailable}
        workspaceId={workspaceId ?? undefined}
      />
    </>
  );
}
