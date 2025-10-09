/**
 * Simple restart confirmation dialog
 */
import { dialog } from 'electron';

export async function showRestartDialog(): Promise<boolean> {
  const result = await dialog.showMessageBox({
    type: 'question',
    buttons: ['Restart Overlay', 'Later'],
    defaultId: 0,
    cancelId: 1,
    title: 'Overlay Restart Required',
    message: 'Feature settings updated',
    detail: 'The overlay will restart to apply your changes.\n\nYour game will NOT be affected.'
  });
  
  return result.response === 0;
}
