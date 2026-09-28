import {
  GenerationStreamEvent,
  GenerationStreamEventSchema,
  GenerationStreamEventType,
} from '@aristocolors/contracts';
import { RedisLike } from './redis-like';
import { GenerationStreamReplayBuffer } from './replay-buffer';

export type GenerationStreamListener = (event: GenerationStreamEvent) => void | Promise<void>;

export interface SSEBroadcasterOptions {
  redis: RedisLike;
  replayBuffer: GenerationStreamReplayBuffer;
  channelPrefix?: string;
}

export type PublishGenerationEventInput = Omit<GenerationStreamEvent, 'seq'> & { seq?: never };

interface GenerationSubscriptionState {
  listeners: Set<GenerationStreamListener>;
  unsubscribeRedis: (() => Promise<void>) | null;
}

export class SSEBroadcaster {
  private readonly redis: RedisLike;
  private readonly replayBuffer: GenerationStreamReplayBuffer;
  private readonly channelPrefix: string;
  private readonly subscriptions = new Map<string, GenerationSubscriptionState>();

  constructor(options: SSEBroadcasterOptions) {
    this.redis = options.redis;
    this.replayBuffer = options.replayBuffer;
    this.channelPrefix = options.channelPrefix ?? 'dispatcher:sse:channel';
  }

  async publish(event: PublishGenerationEventInput): Promise<GenerationStreamEvent> {
    const storedEvent = await this.replayBuffer.append(event);
    const serializedEvent = JSON.stringify(storedEvent);

    await this.redis.publish(this.channelName(storedEvent.generationId), serializedEvent);

    return storedEvent;
  }

  async subscribe(
    generationId: string,
    listener: GenerationStreamListener,
  ): Promise<() => Promise<void>> {
    let state = this.subscriptions.get(generationId);

    if (!state) {
      state = {
        listeners: new Set<GenerationStreamListener>(),
        unsubscribeRedis: null,
      };
      this.subscriptions.set(generationId, state);
    }

    state.listeners.add(listener);

    if (state.listeners.size === 1) {
      state.unsubscribeRedis = await this.redis.subscribe(
        this.channelName(generationId),
        async (message) => {
          const parsed = GenerationStreamEventSchema.parse(JSON.parse(message));
          if (parsed.generationId !== generationId) {
            return;
          }

          await this.dispatchToLocalListeners(generationId, parsed);
        },
      );
    }

    return async () => {
      const currentState = this.subscriptions.get(generationId);
      if (!currentState) {
        return;
      }

      currentState.listeners.delete(listener);

      if (currentState.listeners.size === 0) {
        const unsubscribeRedis = currentState.unsubscribeRedis;
        this.subscriptions.delete(generationId);

        if (unsubscribeRedis) {
          await unsubscribeRedis();
        }
      }
    };
  }

  private async dispatchToLocalListeners(
    generationId: string,
    event: GenerationStreamEvent,
  ): Promise<void> {
    const state = this.subscriptions.get(generationId);
    if (!state || state.listeners.size === 0) {
      return;
    }

    const listeners = Array.from(state.listeners);
    for (const listener of listeners) {
      await listener(event);
    }
  }

  private channelName(generationId: string): string {
    return `${this.channelPrefix}:generation:${generationId}`;
  }
}
