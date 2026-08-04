export interface Logger {
  debug(payload: Record<string, unknown>, message?: string): void;
  info(payload: Record<string, unknown>, message?: string): void;
  warn(payload: Record<string, unknown>, message?: string): void;
  error(payload: Record<string, unknown>, message?: string): void;
}

export const silentLogger: Logger = {
  debug() {  },
  info() {  },
  warn() {  },
  error() {  },
};

export const consoleLogger: Logger = {
  debug(payload, message) { console.debug('[trama]', message ?? '', payload); },
  info(payload, message)  { console.info('[trama]',  message ?? '', payload); },
  warn(payload, message)  { console.warn('[trama]',  message ?? '', payload); },
  error(payload, message) { console.error('[trama]', message ?? '', payload); },
};
