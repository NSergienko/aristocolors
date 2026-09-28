import express, { type Express } from 'express';
import {
  createBlendGatewayRouter,
  type BlendGatewayRouterOptions,
} from './routes';
import { createGenerationStreamHandler } from '../sse/handler';
import { type SSEBroadcaster } from '../sse/broadcaster';
import { type GenerationStreamReplayBuffer } from '../sse/replay-buffer';

export interface BlendGatewayAppOptions extends BlendGatewayRouterOptions {
  sse: {
    broadcaster: SSEBroadcaster;
    replayBuffer: GenerationStreamReplayBuffer;
    heartbeatIntervalMs?: number;
  };
}

export function createBlendGatewayApp(
  options: BlendGatewayAppOptions,
): Express {
  const app = express();

  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      service: 'dispatcher-gateway',
    });
  });

  app.get(
    '/api/v1/generations/:id/stream',
    createGenerationStreamHandler({
      broadcaster: options.sse.broadcaster,
      replayBuffer: options.sse.replayBuffer,
      heartbeatIntervalMs: options.sse.heartbeatIntervalMs,
    }),
  );

  app.use('/api/v1', createBlendGatewayRouter(options));

  return app;
}
