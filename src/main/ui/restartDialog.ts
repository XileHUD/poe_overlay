/**
 * Simple restart confirmation dialog
 */
import { dialog, BrowserWindow } from 'electron';

export async function showRestartDialog(parent?: BrowserWindow | null): Promise<boolean> {
  const opts: Electron.MessageBoxOptions = {
    type: 'question',
    buttons: ['Restart Overlay', 'Later'],
    defaultId: 0,
    cancelId: 1,
    title: 'Overlay Restart Required',
    message: 'Feature settings updated',
    detail: 'The overlay will restart to apply your changes.\n\nYour game will NOT be affected.'
  } as const;

  const result = parent
    ? await dialog.showMessageBox(parent, opts)
    : await dialog.showMessageBox(opts);
  
  return result.response === 0;
}
