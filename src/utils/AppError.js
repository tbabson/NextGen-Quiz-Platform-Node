/**
 * An expected, client-facing error. The central error handler serialises it as
 * {"error": {"code", "message", "details"}} with the given HTTP status.
 */
export default class AppError extends Error {
  constructor(status, code, message, details = []) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(code, message, details) {
    return new AppError(400, code, message, details);
  }

  static unauthorized(message = 'Authentication required.', code = 'UNAUTHENTICATED') {
    return new AppError(401, code, message);
  }

  static forbidden(message = 'You do not have access to this resource.') {
    return new AppError(403, 'FORBIDDEN', message);
  }

  static notFound(message = 'Resource not found.') {
    return new AppError(404, 'NOT_FOUND', message);
  }

  static conflict(code, message, details) {
    return new AppError(409, code, message, details);
  }

  static validation(details, message = 'The request contains invalid data.') {
    return new AppError(422, 'VALIDATION_FAILED', message, details);
  }
}
