import { Router, type Request, type Response } from 'express';
import { BlendRequestSchema } from '@aristocolors/contracts';
import { BlendGatewayService, DuplicateBlendExecutionError } from './service';

export interface BlendGatewayRouterOptions {
  service: BlendGatewayService;
}

type RequestWithUserContext = Request & {
  userId?: string;
  user?: {
    id?: string;
  };
};

export function createBlendGatewayRouter(options: BlendGatewayRouterOptions): Router {
  const router = Router();

  router.post('/projects/:projectId/blend', async (req: Request, res: Response) => {
    const projectId = readProjectId(req);
    if (!projectId) {
      res.status(400).json({
        success: false,
        error: 'Invalid or missing projectId route parameter',
      });
      return;
    }

    const idempotencyKey = readIdempotencyKey(req);
    if (!idempotencyKey) {
      res.status(400).json({
        success: false,
        error: 'Missing Idempotency-Key header',
      });
      return;
    }

    const userId = readUserId(req as RequestWithUserContext);
    if (!userId) {
      res.status(400).json({
        success: false,
        error: 'Missing authenticated userId',
      });
      return;
    }

    const parsedRequest = BlendRequestSchema.safeParse(req.body);
    if (!parsedRequest.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid blend request',
        issues: parsedRequest.error.issues,
      });
      return;
    }

    try {
      const result = await options.service.createBlendGeneration({
        projectId,
        idempotencyKey,
        userId,
        request: parsedRequest.data,
      });

      res.status(result.isExisting ? 200 : 202).json(result);
    } catch (error) {
      if (error instanceof DuplicateBlendExecutionError) {
        res.status(409).json({
          success: false,
          error: error.message,
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  return router;
}

function readProjectId(req: Request): string | null {
  const value = req.params.projectId;
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readIdempotencyKey(req: Request): string | null {
  const headerValue = req.header('Idempotency-Key');
  if (typeof headerValue !== 'string') {
    return null;
  }

  const trimmed = headerValue.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readUserId(req: RequestWithUserContext): string | null {
  const candidates = [
    req.userId,
    req.user?.id,
    readSingleHeader(req, 'x-user-id'),
    readSingleHeader(req, 'x-authenticated-user-id'),
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== 'string') {
      continue;
    }

    const trimmed = candidate.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }

  return null;
}

function readSingleHeader(req: Request, headerName: string): string | null {
  const value = req.header(headerName);
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
