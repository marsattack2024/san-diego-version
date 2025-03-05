const chatLogger = {
  error: (message: string, context?: Record<string, any>) => {
    console.error(`[Chat] ${message}`, context);
  },
  info: (message: string, context?: Record<string, any>) => {
    console.info(`[Chat] ${message}`, context);
  },
  debug: (message: string, context?: Record<string, any>) => {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(`[Chat] ${message}`, context);
    }
  }
};

export { chatLogger }; 