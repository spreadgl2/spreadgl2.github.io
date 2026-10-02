import * as Comlink from 'comlink';
import {
  inspectLogText,
  type LogInspection,
  type LogTable,
  type ParseLogOptions,
  parseLogText,
} from '../lib/log/log-table.js';
import { assertInputSize, assertTextSize } from '../lib/security/input-limits.js';

export interface LogWorkerApi {
  /** Reads only the header and sample count, for the import preview. */
  inspect(input: string | File): Promise<LogInspection>;
  parse(input: string | File, options?: ParseLogOptions): Promise<LogTable>;
}

async function readLogText(input: string | File): Promise<string> {
  if (typeof input !== 'string') assertInputSize('log', input.size);
  const text = typeof input === 'string' ? input : await input.text();
  assertTextSize('log', text);
  return text;
}

export function getLogTransferables(table: LogTable): Transferable[] {
  return table.columns.map((col) => col.buffer);
}

function createLogApi(): LogWorkerApi {
  return {
    async inspect(input: string | File): Promise<LogInspection> {
      return inspectLogText(await readLogText(input));
    },
    async parse(input: string | File, options?: ParseLogOptions): Promise<LogTable> {
      const table = parseLogText(await readLogText(input), options);
      return Comlink.transfer(table, getLogTransferables(table));
    },
  };
}

export type { LogInspection, LogTable };

if ('WorkerGlobalScope' in globalThis) {
  Comlink.expose(createLogApi());
}
