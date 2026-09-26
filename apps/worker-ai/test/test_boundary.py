import json
import os
import sys
import threading
import time
import urllib.request
import urllib.error

# Ensure parent directory is in python path
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

from src.config import WorkerAiConfig
from service_main import StatelessRpcHandler, HTTPServer

def assert_true(condition: bool, message: str):
    if not condition:
        raise AssertionError(f"Test failed: {message}")

print("=== Starting Phase 1 / Step 1: Python ML Runtime & Architectural Boundary Tests ===")

# Test 1: Invariant Check - Python does NOT consume BullMQ
print("1. Verifying BullMQ Boundary Invariant (Python must NOT consume BullMQ directly)...")
config = WorkerAiConfig()
assert_true(config.consumes_bullmq is False, "consumes_bullmq must be explicitly False")
assert_true(config.stateless is True, "stateless must be explicitly True")

# Test that setting forbidden BullMQ consumer keys triggers RuntimeError
os.environ["BULLMQ_QUEUE_NAME"] = "photobash-render-queue"
try:
    WorkerAiConfig.assert_architectural_boundary_invariants()
    raise AssertionError("Failed to detect forbidden BullMQ environment variable!")
except RuntimeError as err:
    assert_true("Architectural Boundary Violation" in str(err), "Expected boundary violation error")
    print("   [PASS] Boundary invariant triggered on forbidden BullMQ environment variable.")
finally:
    del os.environ["BULLMQ_QUEUE_NAME"]

# Test 2: Start Stateless RPC Server on local port
TEST_PORT = 18888
TEST_HOST = "127.0.0.1"
server = HTTPServer((TEST_HOST, TEST_PORT), StatelessRpcHandler)
server_thread = threading.Thread(target=server.serve_forever, daemon=True)
server_thread.start()
print(f"2. Started temporary in-process RPC server on http://{TEST_HOST}:{TEST_PORT}")
time.sleep(0.1)

try:
    # Test 3: Healthcheck Endpoint
    print("3. Verifying GET /health endpoint...")
    req = urllib.request.Request(f"http://{TEST_HOST}:{TEST_PORT}/health")
    with urllib.request.urlopen(req) as resp:
        assert_true(resp.status == 200, f"Expected 200, got {resp.status}")
        data = json.loads(resp.read().decode("utf-8"))
        assert_true(data["status"] == "ok", "Status must be ok")
        assert_true(data["stateless"] is True, "Must report stateless=True")
        assert_true(data["consumes_bullmq"] is False, "Must report consumes_bullmq=False")
        assert_true(
            "Node.js 22 Dispatcher -> Python 3.11 ML Runtime" in data["architecture_boundary"],
            "Must report correct architecture boundary",
        )
        print("   [PASS] /health returned valid telemetry and verified boundary.")

    # Test 4: RPC Compute Endpoint - Ping
    print("4. Verifying POST /rpc/v1/compute (Ping)...")
    payload = {
        "taskId": "task-test-001",
        "idempotencyKey": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
        "taskType": "ping",
        "payload": {},
    }
    req = urllib.request.Request(
        f"http://{TEST_HOST}:{TEST_PORT}/rpc/v1/compute",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as resp:
        assert_true(resp.status == 200, f"Expected 200, got {resp.status}")
        res_data = json.loads(resp.read().decode("utf-8"))
        assert_true(res_data["taskId"] == "task-test-001", "Task ID must match")
        assert_true(res_data["status"] == "completed", "Status must be completed")
        assert_true(res_data["result"]["pong"] is True, "Result must contain pong=True")
        assert_true(res_data["executionTimeMs"] >= 0, "Execution time must be measured")
        print("   [PASS] RPC Ping task executed cleanly.")

    # Test 5: RPC Compute Endpoint - GenerationJobPayload Task
    print("5. Verifying POST /rpc/v1/compute with GenerationJobPayload attributes...")
    job_payload = {
        "taskId": "task-render-100",
        "idempotencyKey": "99999999-9999-4999-8999-999999999999",
        "taskType": "render_photobash",
        "payload": {
            "jobId": "job-abc-123",
            "projectId": "11111111-1111-4111-8111-111111111111",
            "userId": "22222222-2222-4222-8222-222222222222",
            "aristoColorsId": "33333333-3333-4333-8333-333333333333",
            "targetProvider": "diffusion_sdxl",
            "resolution": "1080x1920",
            "harmonizationIntensity": 0.85,
            "seed": 42,
            "creditReservationId": "44444444-4444-4444-8444-444444444444",
            "priority": 1,
            "manifestSnapshot": {
                "version": 1,
                "projectId": "11111111-1111-4111-8111-111111111111",
                "canvasWidth": 1920,
                "canvasHeight": 1080,
                "canvasDpi": 72,
                "layers": []
            },
            "provenance": {
                "manifestVersion": 1,
                "manifestChecksumSha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                "compilerVersion": "compiler-v1.0",
                "profileVersion": "profile-v1.0",
                "sourceAssetChecksums": {},
                "seed": 42,
                "targetProvider": "diffusion_sdxl",
                "resolution": "1080x1920",
                "createdAt": "2026-09-26T12:00:00Z"
            }
        },
    }
    req = urllib.request.Request(
        f"http://{TEST_HOST}:{TEST_PORT}/rpc/v1/compute",
        data=json.dumps(job_payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as resp:
        assert_true(resp.status == 200, f"Expected 200, got {resp.status}")
        res_data = json.loads(resp.read().decode("utf-8"))
        assert_true(res_data["taskId"] == "task-render-100", "Task ID must match")
        assert_true(res_data["status"] == "completed", "Status must be completed")
        assert_true(res_data["result"]["jobId"] == "job-abc-123", "Job ID must match")
        assert_true(res_data["result"]["stateless"] is True, "Result must maintain stateless flag")
        print("   [PASS] Photobash render task dispatched and processed statelessly.")

    # Test 6: Error Handling for Malformed Payload
    print("6. Verifying error handling for malformed RPC request...")
    bad_payload = {"someRandomField": 123}
    req = urllib.request.Request(
        f"http://{TEST_HOST}:{TEST_PORT}/rpc/v1/compute",
        data=json.dumps(bad_payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    try:
        urllib.request.urlopen(req)
        raise AssertionError("Server should have rejected malformed payload")
    except urllib.error.HTTPError as http_err:
        assert_true(http_err.code == 400, f"Expected HTTP 400, got {http_err.code}")
        err_body = json.loads(http_err.read().decode("utf-8"))
        assert_true(err_body["status"] == "failed", "Error status must be failed")
        assert_true(err_body["error"] is not None, "Error message must be present")
        print("   [PASS] Malformed request properly rejected with HTTP 400 and structured error response.")

    print("\n=== All Phase 1 / Step 1 Tests Passed Successfully! ===")

finally:
    server.shutdown()
    server.server_close()
