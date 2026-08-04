import { ConnectorError } from './errors.js';

export interface CircuitBreakerOptions {
  
  threshold?: number;
  
  resetTimeoutMs?: number;
}

type State = 'closed' | 'open' | 'half-open';

export class CircuitBreaker {
  private failures = 0;
  private lastFailure: number | null = null;
  private state: State = 'closed';
  private readonly threshold: number;
  private readonly resetTimeoutMs: number;

  constructor(options: CircuitBreakerOptions = {}) {
    this.threshold      = options.threshold      ?? 5;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 30_000;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - (this.lastFailure ?? 0) > this.resetTimeoutMs) {
        this.state = 'half-open';
      } else {
        throw new ConnectorError('CONNECTOR_CIRCUIT_OPEN', 'Upstream API is degraded — try again shortly');
      }
    }

    try {
      const result = await fn();
      this.failures = 0;
      this.state = 'closed';
      return result;
    } catch (err) {
      this.failures++;
      this.lastFailure = Date.now();
      if (this.failures >= this.threshold) this.state = 'open';
      throw err;
    }
  }

  get isOpen(): boolean { return this.state === 'open'; }
}
