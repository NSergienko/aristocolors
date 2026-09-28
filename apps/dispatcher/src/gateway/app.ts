import express, { type Express } from 'express';
import {
  createBlendGatewayRouter,
  type BlendGatewayRouterOptions,
} from './routes';

export function createBlendGatewayApp(
  options: BlendGatewayRouterOptions,
): Express {
  const app = express();

  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      service: 'dispatcher-gateway',
    });
  });

  app.use('/api/v1', createBlendGatewayRouter(options));

  return app;
}
