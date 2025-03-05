// Type definitions for third-party libraries
declare module 'lodash' {
  export function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait?: number,
    options?: {
      leading?: boolean;
      trailing?: boolean;
      maxWait?: number;
    }
  ): T;

  export function throttle<T extends (...args: any[]) => any>(
    func: T,
    wait?: number,
    options?: {
      leading?: boolean;
      trailing?: boolean;
    }
  ): T;
}

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