export type ConnectorErrorCode =
  | 'CONNECTOR_AUTH'
  | 'CONNECTOR_RATE_LIMIT'
  | 'CONNECTOR_UPSTREAM'
  | 'CONNECTOR_CIRCUIT_OPEN'
  | 'CONNECTOR_VALIDATION'
  | 'CONNECTOR_NOT_CONFIGURED';

export class ConnectorError extends Error {
  public readonly code: ConnectorErrorCode;
  public readonly status: number | undefined;
  public readonly platform: string | undefined;

  constructor(code: ConnectorErrorCode, message: string, options?: { status?: number; platform?: string; cause?: unknown }) {
    super(message);
    this.name = 'ConnectorError';
    this.code = code;
    this.status = options?.status;
    this.platform = options?.platform;
    if (options?.cause !== undefined) (this as unknown as { cause: unknown }).cause = options.cause;
  }
}
