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
  constructor(message = 'Requisição inválida') { super(400, 'BAD_REQUEST', message); }
}
export class UnauthorizedError extends AppError {
  constructor(message = 'Não autenticado') { super(401, 'UNAUTHORIZED', message); }
}
export class ForbiddenError extends AppError {
  constructor(message = 'Sem permissão') { super(403, 'FORBIDDEN', message); }
}
export class NotFoundError extends AppError {
  constructor(message = 'Não encontrado') { super(404, 'NOT_FOUND', message); }
}
export class ConflictError extends AppError {
  constructor(message = 'Conflito') { super(409, 'CONFLICT', message); }
}
export class ValidationError extends AppError {
  constructor(message = 'Payload inválido', details?: unknown) {
    super(422, 'VALIDATION', message, details);
  }
}
