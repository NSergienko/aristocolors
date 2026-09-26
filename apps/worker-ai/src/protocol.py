from dataclasses import dataclass, asdict
from typing import Any, Optional

@dataclass
class HealthResponse:
    status: str
    runtime: str
    stateless: bool
    consumes_bullmq: bool
    architecture_boundary: str
    gpu_available: bool
    gpu_device: str
    version: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

@dataclass
class RpcTaskRequest:
    task_id: str
    idempotency_key: str
    task_type: str
    payload: dict[str, Any]
    timeout_ms: int = 30000

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "RpcTaskRequest":
        # Support both camelCase (TypeScript) and snake_case (Python)
        task_id = data.get("taskId") or data.get("task_id")
        idempotency_key = data.get("idempotencyKey") or data.get("idempotency_key")
        task_type = data.get("taskType") or data.get("task_type")
        payload = data.get("payload") or {}
        timeout_ms = data.get("timeoutMs") or data.get("timeout_ms", 30000)

        if not task_id:
            raise ValueError("Missing required field: taskId / task_id")
        if not idempotency_key:
            raise ValueError("Missing required field: idempotencyKey / idempotency_key")
        if not task_type:
            raise ValueError("Missing required field: taskType / task_type")

        return cls(
            task_id=str(task_id),
            idempotency_key=str(idempotency_key),
            task_type=str(task_type),
            payload=payload,
            timeout_ms=int(timeout_ms),
        )

@dataclass
class RpcTaskResponse:
    task_id: str
    status: str  # "completed" | "failed"
    result: Optional[dict[str, Any]]
    error: Optional[str]
    execution_time_ms: float

    def to_dict(self) -> dict[str, Any]:
        # Return camelCase for direct Node.js TypeScript consumers
        return {
            "taskId": self.task_id,
            "status": self.status,
            "result": self.result,
            "error": self.error,
            "executionTimeMs": round(self.execution_time_ms, 3),
        }
