import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api.js';

function shouldRetry(failureCount, error) {
  if (error instanceof ApiError && error.status && error.status < 500 && error.status !== 429) return false;
  return failureCount < 2;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: 'offlineFirst',
      staleTime: 30_000,
      retry: shouldRetry,
      retryDelay: (attempt) => Math.min(1_000 * (2 ** attempt), 10_000),
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: false,
      networkMode: 'online',
    },
  },
});
