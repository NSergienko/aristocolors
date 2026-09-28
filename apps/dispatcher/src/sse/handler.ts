import type { Request, Response, RequestHandler } from 'express';
import { GenerationStreamEvent } from '@aristocolors/contracts';
import { SSEBroadcaster } from './broadcaster';
import { GenerationStreamReplayBuffer } from './replay-buffer';

export interface GenerationStreamHandlerOptions {
  broadcaster: SSEBroadcaster;
  replayBuffer: GenerationStreamReplayBuffer;
  heartbeatIntervalMs?: number;
}

export function createGenerationStreamHandler(
  options: GenerationStreamHandlerOptions,
): RequestHandler {
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? 15000;

  return async function generationStreamHandler(
    req: Request,
    res: Response,
  ): Promise<void> {
    const generationId =
      typeof req.params.id === 'string' ? req.params.id.trim() : '';

    if (!generationId) {
      res.status(400).json({
        error: 'Invalid generationId',
      });
      return;
    }

    const parsedLastEventId = parseLastEventId(req);
    if (parsedLastEventId.error) {
      res.status(400).json({
        error: parsedLastEventId.error,
      });
      return;
    }

    const lastEventId = parsedLastEventId.value;

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');

    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    let closed = false;
    let heartbeatTimer: NodeJS.Timeout | null = null;
    let unsubscribe: (() => Promise<void>) | null = null;
    let highestDeliveredSeq = lastEventId;
    let replayInProgress = true;
    const bufferedLiveEvents: GenerationStreamEvent[] = [];

    const cleanup = async (): Promise<void> => {
      if (closed) {
        return;
      }

      closed = true;

      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }

      const currentUnsubscribe = unsubscribe;
      unsubscribe = null;

      if (currentUnsubscribe) {
        await currentUnsubscribe();
      }
    };

    const writeSseEvent = (event: GenerationStreamEvent): void => {
      res.write(`id: ${event.seq}\n`);
      res.write(`event: ${event.type}\n`);
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    const isTerminalEvent = (event: GenerationStreamEvent): boolean =>
      event.type === 'completed' || event.type === 'failed';

    const deliverEvent = async (event: GenerationStreamEvent): Promise<void> => {
      if (closed) {
        return;
      }

      if (event.seq <= highestDeliveredSeq) {
        return;
      }

      if (event.seq !== highestDeliveredSeq + 1 && highestDeliveredSeq !== lastEventId) {
        if (event.seq < highestDeliveredSeq) {
          return;
        }
      }

      writeSseEvent(event);
      highestDeliveredSeq = event.seq;

      if (isTerminalEvent(event)) {
        await cleanup();
        if (!res.writableEnded) {
          res.end();
        }
      }
    };

    req.on('close', () => {
      void cleanup();
    });

    req.on('error', () => {
      void cleanup();
    });

    res.on('close', () => {
      void cleanup();
    });

    res.on('error', () => {
      void cleanup();
    });

    try {
      unsubscribe = await options.broadcaster.subscribe(
        generationId,
        async (event: GenerationStreamEvent) => {
          if (closed) {
            return;
          }

          if (replayInProgress) {
            bufferedLiveEvents.push(event);
            return;
          }

          await deliverEvent(event);
        },
      );

      const replayEvents = await options.replayBuffer.listAfter(
        generationId,
        lastEventId,
      );

      for (const replayEvent of replayEvents) {
        await deliverEvent(replayEvent);
        if (closed) {
          return;
        }
      }

      replayInProgress = false;

      bufferedLiveEvents
        .sort((a, b) => a.seq - b.seq)
        .filter((event) => event.seq > highestDeliveredSeq)
        .forEach((event) => {
          bufferedLiveEvents.push();
        });

      const remainingBufferedEvents = bufferedLiveEvents
        .sort((a, b) => a.seq - b.seq)
        .filter((event) => event.seq > highestDeliveredSeq);

      bufferedLiveEvents.length = 0;

      for (const event of remainingBufferedEvents) {
        await deliverEvent(event);
        if (closed) {
          return;
        }
      }

      heartbeatTimer = setInterval(() => {
        if (closed || res.writableEnded) {
          return;
        }
        res.write(': ping\n\n');
      }, heartbeatIntervalMs);
    } catch (error) {
      await cleanup();

      if (!res.headersSent) {
        res.status(500).json({
          error: 'Failed to initialize generation stream',
        });
        return;
      }

      if (!res.writableEnded) {
        res.end();
      }
    }
  };
}

function parseLastEventId(
  req: Request,
): { value: number; error?: undefined } | { value: null; error: string } {
  const headerValue = req.get('Last-Event-ID');
  const queryValue = typeof req.query.lastEventId === 'string'
    ? req.query.lastEventId
    : undefined;

  const rawValue = headerValue ?? queryValue;

  if (rawValue === undefined) {
    return { value: 0 };
  }

  const normalized = rawValue.trim();
  if (!normalized) {
    return { value: null, error: 'Invalid Last-Event-ID' };
  }

  if (!/^\d+$/.test(normalized)) {
    return { value: null, error: 'Invalid Last-Event-ID' };
  }

  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    return { value: null, error: 'Invalid Last-Event-ID' };
  }

  return { value: parsed };
}
