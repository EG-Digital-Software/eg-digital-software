export class ApiError extends Error {
  status: number;
  errors?: Record<string, unknown>;

  constructor(status: number, message: string, errors?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.errors = errors;
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  static badRequest(message = 'Bad request', errors?: Record<string, unknown>) {
    return new ApiError(400, message, errors);
  }
  static unauthorized(message = 'Unauthorized') {
    return new ApiError(401, message);
  }
  static forbidden(message = 'Forbidden') {
    return new ApiError(403, message);
  }
  static notFound(message = 'Not found') {
    return new ApiError(404, message);
  }
  static conflict(message = 'Conflict') {
    return new ApiError(409, message);
  }
  static internal(message = 'Something went wrong') {
    return new ApiError(500, message);
  }
  static badGateway(message = 'Upstream service unavailable') {
    return new ApiError(502, message);
  }
}
