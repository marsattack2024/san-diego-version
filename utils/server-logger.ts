// Simple logger implementation for ESM compatibility
// This is a temporary solution until we can properly fix the pino import issues

// Define a type for our logger functions
interface LogFn {
  (obj: object, msg?: string): void;
  (msg: string): void;
}

// Define our logger interface
interface Logger {
  fatal: LogFn;
  error: LogFn;
  warn: LogFn;
  info: LogFn;
  debug: LogFn;
  trace: LogFn;
  child: (bindings: object) => Logger;
}

// Create a simple console-based logger
const logger: Logger = {
  fatal: (objOrMsg: object | string, msg?: string) => {
    if (typeof objOrMsg === 'string') {
      console.error(`[FATAL] ${objOrMsg}`);
    } else {
      console.error(`[FATAL] ${msg || ''}`, objOrMsg);
    }
  },
  error: (objOrMsg: object | string, msg?: string) => {
    if (typeof objOrMsg === 'string') {
      console.error(`[ERROR] ${objOrMsg}`);
    } else {
      console.error(`[ERROR] ${msg || ''}`, objOrMsg);
    }
  },
  warn: (objOrMsg: object | string, msg?: string) => {
    if (typeof objOrMsg === 'string') {
      console.warn(`[WARN] ${objOrMsg}`);
    } else {
      console.warn(`[WARN] ${msg || ''}`, objOrMsg);
    }
  },
  info: (objOrMsg: object | string, msg?: string) => {
    if (typeof objOrMsg === 'string') {
      console.info(`[INFO] ${objOrMsg}`);
    } else {
      console.info(`[INFO] ${msg || ''}`, objOrMsg);
    }
  },
  debug: (objOrMsg: object | string, msg?: string) => {
    if (typeof objOrMsg === 'string') {
      console.debug(`[DEBUG] ${objOrMsg}`);
    } else {
      console.debug(`[DEBUG] ${msg || ''}`, objOrMsg);
    }
  },
  trace: (objOrMsg: object | string, msg?: string) => {
    if (typeof objOrMsg === 'string') {
      console.trace(`[TRACE] ${objOrMsg}`);
    } else {
      console.trace(`[TRACE] ${msg || ''}`, objOrMsg);
    }
  },
  child: (bindings: object) => {
    // Return a new logger with the bindings
    return {
      ...logger,
      fatal: (objOrMsg: object | string, msg?: string) => {
        if (typeof objOrMsg === 'string') {
          logger.fatal({ ...bindings, message: objOrMsg });
        } else {
          logger.fatal({ ...bindings, ...objOrMsg }, msg);
        }
      },
      error: (objOrMsg: object | string, msg?: string) => {
        if (typeof objOrMsg === 'string') {
          logger.error({ ...bindings, message: objOrMsg });
        } else {
          logger.error({ ...bindings, ...objOrMsg }, msg);
        }
      },
      warn: (objOrMsg: object | string, msg?: string) => {
        if (typeof objOrMsg === 'string') {
          logger.warn({ ...bindings, message: objOrMsg });
        } else {
          logger.warn({ ...bindings, ...objOrMsg }, msg);
        }
      },
      info: (objOrMsg: object | string, msg?: string) => {
        if (typeof objOrMsg === 'string') {
          logger.info({ ...bindings, message: objOrMsg });
        } else {
          logger.info({ ...bindings, ...objOrMsg }, msg);
        }
      },
      debug: (objOrMsg: object | string, msg?: string) => {
        if (typeof objOrMsg === 'string') {
          logger.debug({ ...bindings, message: objOrMsg });
        } else {
          logger.debug({ ...bindings, ...objOrMsg }, msg);
        }
      },
      trace: (objOrMsg: object | string, msg?: string) => {
        if (typeof objOrMsg === 'string') {
          logger.trace({ ...bindings, message: objOrMsg });
        } else {
          logger.trace({ ...bindings, ...objOrMsg }, msg);
        }
      },
      child: (newBindings: object) => {
        return logger.child({ ...bindings, ...newBindings });
      }
    };
  }
};

// Default export for ESM compatibility
export default logger;

// Named export for backward compatibility
export { logger };

// Create child loggers with context
export function createRequestLogger(req: any) {
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  return logger.child({ requestId });
} 