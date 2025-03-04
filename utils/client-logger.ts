import log from 'loglevel';

// Configure based on environment
if (process.env.NODE_ENV === 'production') {
  log.setLevel('warn');
} else {
  log.setLevel('debug');
}

// Create namespaced loggers for components
export function createLogger(namespace: string) {
  return {
    debug: (message: string, data?: any) => 
      log.debug(`[${namespace}] ${message}`, data),
    info: (message: string, data?: any) => 
      log.info(`[${namespace}] ${message}`, data),
    warn: (message: string, data?: any) => 
      log.warn(`[${namespace}] ${message}`, data),
    error: (message: string, error?: any) => 
      log.error(`[${namespace}] ${message}`, error),
  };
}

// Optional: Remote logging setup - can be enabled through env variable
if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_ENABLE_REMOTE_LOGGING === 'true') {
  // Dynamically import to avoid SSR issues
  import('loglevel-plugin-remote')
    .then(({ apply }) => {
      log.info('Initializing remote logging');
      apply(log, { 
        url: '/api/client-logs',
        method: 'POST',
        timeout: 2000,
        interval: 1000, // batch logs
        capacity: 500,
        level: 'warn' // only send warnings and errors
      });
      log.info('Remote logging initialized successfully');
    })
    .catch(err => {
      console.error('Failed to initialize remote logging:', err);
      // Continue without remote logging
      log.warn('Remote logging disabled due to initialization error');
    });
}

export default log; 