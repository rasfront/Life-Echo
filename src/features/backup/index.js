// Feature: backup (export/import) using Storage
import { downloadBlob } from '../../utils/download.js';

export function createBackupFeature(ui, storage, onAfterImport) {
  async function onExport() {
    try {
      ui.setStatus?.('Экспорт...');
      const blob = await storage.exportAll();
      const ts = new Date().toISOString().replace(/[:.]/g,'-');
      downloadBlob(blob, `life-echo-backup-${ts}.json`);
      ui.setStatus?.('Экспорт завершён');
    } catch (e) {
      console.error(e);
      ui.setStatus?.('Ошибка экспорта');
    }
  }

  async function onImport(file) {
    try {
      ui.setStatus?.('Импорт...');
      await storage.importData(file);
      await onAfterImport?.();
      ui.setStatus?.('Импорт завершён');
    } catch (e) {
      console.error(e);
      ui.setStatus?.('Ошибка импорта');
    } finally {
      if (ui.importInput) ui.importInput.value = '';
    }
  }

  return { onExport, onImport };
}
