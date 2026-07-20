import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { Response } from 'express';
import { ZodError } from 'zod';

// Tous les contrôleurs valident leur body avec `schema.parse(body)` directement (pas de
// ValidationPipe Nest). Sans ce filtre, une ZodError n'est pas reconnue comme une erreur HTTP
// et remonte comme une 500 "Internal server error" générique, masquant le vrai message de
// validation (ex. "Format HH:MM attendu") à l'utilisateur.
@Catch(ZodError)
export class ZodExceptionFilter implements ExceptionFilter {
  catch(exception: ZodError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const message = exception.issues.map((issue) => `${issue.path.join('.') || 'valeur'}: ${issue.message}`).join(' ; ');
    response.status(400).json({ statusCode: 400, error: 'Bad Request', message });
  }
}
