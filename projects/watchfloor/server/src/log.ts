/** Minimal structured-ish logger. Swap for pino later without touching call sites. */
type Level = 'debug' | 'info' | 'warn' | 'error';

const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
// globalThis.process: the static demo runs this file in a browser, where there is no process.
const threshold = order[(globalThis.process?.env?.LOG_LEVEL as Level | undefined) ?? 'info'] ?? order.info;

function write(level: Level, scope: string, msg: string, extra?: Record<string, unknown>) {
  if (order[level] < threshold) return;
  const time = new Date().toISOString().slice(11, 19);
  const tail = extra && Object.keys(extra).length ? ' ' + JSON.stringify(extra) : '';
  const line = `${time} ${level.padEnd(5)} [${scope}] ${msg}${tail}`;
  (level === 'error' || level === 'warn' ? console.error : console.log)(line);
}

export interface Logger {
  debug(msg: string, extra?: Record<string, unknown>): void;
  info(msg: string, extra?: Record<string, unknown>): void;
  warn(msg: string, extra?: Record<string, unknown>): void;
  error(msg: string, extra?: Record<string, unknown>): void;
}

export function createLogger(scope: string): Logger {
  return {
    debug: (m, e) => write('debug', scope, m, e),
    info: (m, e) => write('info', scope, m, e),
    warn: (m, e) => write('warn', scope, m, e),
    error: (m, e) => write('error', scope, m, e),
  };
}
