export class SmsError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SmsError';
    this.code = code;
  }
}
