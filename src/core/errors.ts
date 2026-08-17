export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 400,
    public readonly code = 'APP_ERROR',
  ) {
    super(message);
  }
}

export class ApprovalRequiredError extends AppError {
  constructor() {
    super('Content must be READY before publishing.', 409, 'APPROVAL_REQUIRED');
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found.`, 404, 'NOT_FOUND');
  }
}
