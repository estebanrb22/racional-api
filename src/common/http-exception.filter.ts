import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '../generated/prisma/client';

type ErrorBody = {
  statusCode: number;
  code: string;
  message: string | string[];
  path: string;
  timestamp: string;
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();

    const mapped = this.mapException(exception);
    const body: ErrorBody = {
      statusCode: mapped.status,
      code: mapped.code,
      message: mapped.message,
      path: request.originalUrl,
      timestamp: new Date().toISOString(),
    };

    if (mapped.status === HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(mapped.status).json(body);
  }

  private mapException(exception: unknown): {
    status: HttpStatus;
    code: string;
    message: string | string[];
  } {
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return {
          status: HttpStatus.CONFLICT,
          code: 'UNIQUE_CONSTRAINT_VIOLATION',
          message: 'A resource with the same unique value already exists',
        };
      }
      if (exception.code === 'P2025') {
        return {
          status: HttpStatus.NOT_FOUND,
          code: 'RESOURCE_NOT_FOUND',
          message: 'The requested resource was not found',
        };
      }
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus() as HttpStatus;
      const response = exception.getResponse();

      if (typeof response === 'string') {
        return { status, code: this.defaultCode(status), message: response };
      }

      const body = response as {
        code?: string;
        message?: string | string[];
      };
      return {
        status,
        code: body.code ?? this.defaultCode(status),
        message: body.message ?? exception.message,
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
    };
  }

  private defaultCode(status: HttpStatus): string {
    const codes: Partial<Record<number, string>> = {
      [HttpStatus.BAD_REQUEST]: 'VALIDATION_ERROR',
      [HttpStatus.NOT_FOUND]: 'RESOURCE_NOT_FOUND',
      [HttpStatus.CONFLICT]: 'CONFLICT',
    };
    return codes[status] ?? 'HTTP_ERROR';
  }
}
