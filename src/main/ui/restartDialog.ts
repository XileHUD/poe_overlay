/**
 * Simple restart confirmation dialog
 */
import { dialog, BrowserWindow } from 'electron';

export interface RestartDialogOptions {
  title?: string;
  message?: string;
  detail?: string;
}

export async function showRestartDialog(parent?: BrowserWindow | null, options: RestartDialogOptions = {}): Promise<boolean> {
  const opts: Electron.MessageBoxOptions = {
    type: 'question',
    buttons: ['Restart Overlay', 'Later'],
    defaultId: 0,
    cancelId: 1,
    title: options.title ?? 'Overlay Restart Required',
    message: options.message ?? 'Settings updated',
    detail: options.detail ?? 'The overlay will restart to apply your changes.\n\nYour game will NOT be affected.'
  } as const;

  const result = parent
    ? await dialog.showMessageBox(parent, opts)
    : await dialog.showMessageBox(opts);
  
  return result.response === 0;
}
