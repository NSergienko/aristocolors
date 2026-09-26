import { z } from 'zod';
import { GenerationJobPayloadSchema } from './job';

/**
 * Healthcheck response schema from the Python 3.11 Stateless ML Runtime.
 * Verifies GPU availability, stateless guarantee, and explicit architectural boundary.
 */
export const PythonMlRuntimeHealthSchema = z.object({
  status: z.enum(['ok', 'degraded', 'error']),
  runtime: z.string(),
  stateless: z.literal(true),
  consumesBullmq: z.literal(false),
  architectureBoundary: z.string(),
  gpuAvailable: z.boolean(),
  gpuDevice: z.string(),
  version: z.string(),
});
export type PythonMlRuntimeHealth = z.infer<typeof PythonMlRuntimeHealthSchema>;

/**
 * Supported task types for the Python ML Runtime RPC
 */
export const PythonMlTaskTypeSchema = z.enum([
  'ping',
  'extract_profile',
  'compile_conditioning',
  'render_photobash',
]);
export type PythonMlTaskType = z.infer<typeof PythonMlTaskTypeSchema>;

/**
 * Node.js 22 Dispatcher -> Python 3.11 ML Runtime RPC Request
 */
export const PythonMlRpcRequestSchema = z.object({
  taskId: z.string().min(1),
  idempotencyKey: z.string().uuid(),
  taskType: PythonMlTaskTypeSchema,
  payload: z.union([GenerationJobPayloadSchema, z.record(z.string(), z.unknown())]),
  timeoutMs: z.number().int().positive().default(30000),
});
export type PythonMlRpcRequest = z.infer<typeof PythonMlRpcRequestSchema>;

/**
 * Python 3.11 ML Runtime -> Node.js 22 Dispatcher RPC Response
 */
export const PythonMlRpcResponseSchema = z.object({
  taskId: z.string().min(1),
  status: z.enum(['completed', 'failed']),
  result: z.record(z.string(), z.unknown()).nullable(),
  error: z.string().nullable(),
  executionTimeMs: z.number().nonnegative(),
});
export type PythonMlRpcResponse = z.infer<typeof PythonMlRpcResponseSchema>;
