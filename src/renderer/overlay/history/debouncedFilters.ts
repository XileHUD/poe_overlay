/**
 * debouncedFilters.ts
 * 
 * Debounced filter input handlers to improve performance.
 * Prevents expensive filter operations on every keystroke.
 */

interface DebounceTimer {
  timeout: number | null;
  lastCall: number;
}

const debounceTimers = new Map<string, DebounceTimer>();

/**
 * Debounce a function call
 * 
 * @param key - Unique key for this debounce instance
 * @param fn - Function to debounce
 * @param delay - Delay in milliseconds (default: 300ms)
 */
export function debounce<T extends (...args: any[]) => any>(
  key: string,
  fn: T,
  delay: number = 300
): (...args: Parameters<T>) => void {
  return (...args: Parameters<T>) => {
    let timer = debounceTimers.get(key);
    
    if (!timer) {
      timer = { timeout: null, lastCall: 0 };
      debounceTimers.get(key);
    }
    
    // Clear existing timeout
    if (timer.timeout !== null) {
      clearTimeout(timer.timeout);
    }
    
    // Set new timeout
    timer.timeout = window.setTimeout(() => {
      timer!.lastCall = Date.now();
      timer!.timeout = null;
      fn(...args);
    }, delay);
    
    debounceTimers.set(key, timer);
  };
}

/**
 * Create a debounced filter input handler
 * 
 * @param filterCallback - Function to call after debounce delay
 * @param delay - Delay in milliseconds (default: 300ms)
 */
export function createDebouncedFilterHandler(
  filterCallback: (value: string) => void,
  delay: number = 300
): (event: Event) => void {
  const debouncedFn = debounce('filter-input', filterCallback, delay);
  
  return (event: Event) => {
    const input = event.target as HTMLInputElement;
    const value = input.value;
    debouncedFn(value);
  };
}

/**
 * Create a debounced sort handler
 * 
 * @param sortCallback - Function to call after debounce delay
 * @param delay - Delay in milliseconds (default: 150ms, faster for dropdowns)
 */
export function createDebouncedSortHandler(
  sortCallback: (sortKey: string) => void,
  delay: number = 150
): (event: Event) => void {
  const debouncedFn = debounce('sort-change', sortCallback, delay);
  
  return (event: Event) => {
    const select = event.target as HTMLSelectElement;
    const value = select.value;
    debouncedFn(value);
  };
}

/**
 * Cancel all pending debounced calls
 */
export function cancelAllDebounces(): void {
  debounceTimers.forEach((timer) => {
    if (timer.timeout !== null) {
      clearTimeout(timer.timeout);
      timer.timeout = null;
    }
  });
}

/**
 * Throttle a function (execute at most once per interval)
 * Useful for scroll/resize handlers
 * 
 * @param key - Unique key for this throttle instance
 * @param fn - Function to throttle
 * @param limit - Minimum time between calls in milliseconds
 */
export function throttle<T extends (...args: any[]) => any>(
  key: string,
  fn: T,
  limit: number = 100
): (...args: Parameters<T>) => void {
  return (...args: Parameters<T>) => {
    let timer = debounceTimers.get(key);
    
    if (!timer) {
      timer = { timeout: null, lastCall: 0 };
      debounceTimers.set(key, timer);
    }
    
    const now = Date.now();
    
    if (now - timer.lastCall >= limit) {
      timer.lastCall = now;
      fn(...args);
    }
  };
}
