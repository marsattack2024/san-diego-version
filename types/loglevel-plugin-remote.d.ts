declare module 'loglevel-plugin-remote' {
  export function apply(
    logger: any,
    options: {
      url: string;
      method?: 'GET' | 'POST';
      timeout?: number;
      interval?: number;
      capacity?: number;
      level?: string;
      backoff?: {
        multiplier?: number;
        jitter?: number;
        limit?: number;
      };
      token?: string;
      headers?: Record<string, string>;
    }
  ): void;
} 