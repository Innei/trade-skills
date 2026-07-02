export class ClientError extends Error {
  hint: string | undefined;
  status: number;

  constructor(message: string, hint?: string, status = 400) {
    super(message);
    this.name = "ClientError";
    this.hint = hint;
    this.status = status;
  }
}
