/**
 * Fetch utility with automatic retry and exponential backoff
 * 
 * Handles transient network errors gracefully with configurable retry logic.
 */

export interface FetchWithRetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in milliseconds before first retry (default: 1000) */
  initialDelayMs?: number;
  /** Maximum delay in milliseconds between retries (default: 10000) */
  maxDelayMs?: number;
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier?: number;
  /** HTTP status codes that should trigger a retry (default: 408, 429, 500, 502, 503, 504) */
  retryableStatusCodes?: number[];
  /** Whether to log retry attempts (default: true) */
  logRetries?: boolean;
}

const DEFAULT_OPTIONS: Required<FetchWithRetryOptions> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  retryableStatusCodes: [408, 429, 500, 502, 503, 504],
  logRetries: true,
};

/**
 * Fetch with automatic retry and exponential backoff
 * 
 * @param url - The URL to fetch
 * @param fetchOptions - Standard fetch options (headers, method, etc.)
 * @param retryOptions - Retry configuration options
 * @returns Promise resolving to the Response object
 * @throws Error if all retry attempts fail
 */
export async function fetchWithRetry(
  url: string,
  fetchOptions?: RequestInit,
  retryOptions?: FetchWithRetryOptions
): Promise<Response> {
  const options = { ...DEFAULT_OPTIONS, ...retryOptions };
  let lastError: Error | null = null;
  let delayMs = options.initialDelayMs;

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      const response = await fetch(url, fetchOptions);

      // Check if response status is retryable
      if (!response.ok && options.retryableStatusCodes.includes(response.status)) {
        if (attempt < options.maxRetries) {
          if (options.logRetries) {
            console.log(
              `[fetchWithRetry] Attempt ${attempt + 1}/${options.maxRetries + 1} failed with status ${response.status}. ` +
              `Retrying in ${delayMs}ms...`
            );
          }
          await sleep(delayMs);
          delayMs = Math.min(delayMs * options.backoffMultiplier, options.maxDelayMs);
          continue;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Success or non-retryable error
      return response;

    } catch (error: any) {
      lastError = error;

      // Network errors (fetch failed) are always retryable
      if (attempt < options.maxRetries) {
        if (options.logRetries) {
          console.log(
            `[fetchWithRetry] Attempt ${attempt + 1}/${options.maxRetries + 1} failed: ${error.message}. ` +
            `Retrying in ${delayMs}ms...`
          );
        }
        await sleep(delayMs);
        delayMs = Math.min(delayMs * options.backoffMultiplier, options.maxDelayMs);
        continue;
      }

      // All retries exhausted
      break;
    }
  }

  // If we get here, all retries failed
  const errorMessage = lastError 
    ? `Failed to fetch ${url} after ${options.maxRetries + 1} attempts: ${lastError.message}`
    : `Failed to fetch ${url} after ${options.maxRetries + 1} attempts`;
  
  throw new Error(errorMessage);
}

/**
 * Helper function to sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
