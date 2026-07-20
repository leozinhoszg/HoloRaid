export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Invalid request') { super(400, 'BAD_REQUEST', message); }
}
export class UnauthorizedError extends AppError {
  constructor(message = 'Não autenticado') { super(401, 'UNAUTHORIZED', message); }
}
export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') { super(403, 'FORBIDDEN', message); }
}
export class NotFoundError extends AppError {
  constructor(message = 'Not found') { super(404, 'NOT_FOUND', message); }
}
export class ConflictError extends AppError {
  constructor(message = 'Conflito') { super(409, 'CONFLICT', message); }
}
export class ValidationError extends AppError {
  constructor(message = 'Invalid payload', details?: unknown) {
    super(422, 'VALIDATION', message, details);
  }
}
