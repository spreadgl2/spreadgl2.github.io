import * as Comlink from 'comlink';
import { type LogTable, type ParseLogOptions, parseLogText } from '../lib/log/log-table.js';
import { assertInputSize, assertTextSize } from '../lib/security/input-limits.js';

export interface LogWorkerApi {
  parse(input: string | File, options?: ParseLogOptions): Promise<LogTable>;
}

export function getLogTransferables(table: LogTable): Transferable[] {
  return table.columns.map((col) => col.buffer);
}

function createLogApi(): LogWorkerApi {
  return {
    async parse(input: string | File, options?: ParseLogOptions): Promise<LogTable> {
      if (typeof input !== 'string') assertInputSize('log', input.size);
      const text = typeof input === 'string' ? input : await input.text();
      assertTextSize('log', text);
      const table = parseLogText(text, options);
      return Comlink.transfer(table, getLogTransferables(table));
    },
  };
}

export type { LogTable };

if ('WorkerGlobalScope' in globalThis) {
  Comlink.expose(createLogApi());
}
