import os
import sys
from dataclasses import dataclass

@dataclass(frozen=True)
class WorkerAiConfig:
    host: str = os.getenv("WORKER_AI_HOST", "0.0.0.0")
    port: int = int(os.getenv("WORKER_AI_PORT", "8000"))
    internal_api_secret: str = os.getenv("INTERNAL_API_SECRET", "aristocolors-internal-rpc-secret")
    service_name: str = "aristocolors-worker-ai"
    version: str = "0.1.0"
    stateless: bool = True
    consumes_bullmq: bool = False

    @staticmethod
    def detect_gpu_device() -> tuple[bool, str]:
        """Detect GPU hardware availability without requiring CUDA at import time."""
        try:
            import torch
            if torch.cuda.is_available():
                device_name = torch.cuda.get_device_name(0)
                return True, f"CUDA: {device_name}"
            elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
                return True, "Apple Silicon MPS"
            return False, "CPU (PyTorch fallback)"
        except ImportError:
            return False, "CPU (Standby runtime)"

    @classmethod
    def assert_architectural_boundary_invariants(cls):
        """
        Python must NOT consume BullMQ directly.
        BullMQ queue management is owned by the Node.js 22 Dispatcher.
        Python is an on-demand stateless compute RPC service.
        """
        forbidden_env_keys = [
            "BULLMQ_QUEUE_NAME",
            "BULLMQ_REDIS_URL",
            "BULLMQ_CONSUMER_GROUP",
        ]
        for key in forbidden_env_keys:
            if os.getenv(key):
                raise RuntimeError(
                    f"Architectural Boundary Violation: Found {key} in Python environment. "
                    "Python must NOT consume BullMQ directly. BullMQ is strictly owned by Node.js 22 Dispatcher."
                )

config = WorkerAiConfig()
