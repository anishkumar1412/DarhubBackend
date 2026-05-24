/**
 * Standard API response wrapper.
 * Usage: res.status(200).json(new ApiResponse(200, data, 'Success'))
 */
export class ApiResponse {
  constructor(statusCode, data, message = 'Success', meta) {
    this.statusCode = statusCode;
    this.success    = true;
    this.message    = message;
    this.data       = data;
    if (meta) this.meta = meta;
  }
}