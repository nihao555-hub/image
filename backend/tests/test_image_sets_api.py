import base64
import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app import auth
from app import main
from app.main import app


PNG_1X1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAS"
    "cY42YAAAAASUVORK5CYII="
)


class GenerateImageSetApiTest(unittest.TestCase):
    def setUp(self) -> None:
        app.dependency_overrides[auth.require_user] = lambda: 1
        self.client = TestClient(app)
        main._retry_registry.clear()

    def tearDown(self) -> None:
        app.dependency_overrides.clear()
        main._retry_registry.clear()

    def test_requires_authentication(self) -> None:
        app.dependency_overrides.clear()
        response = self.client.post(
            "/api/image-sets/generate",
            data={"prompt": "A product"},
        )
        self.assertEqual(response.status_code, 401)

    def test_submits_multipart_image_set(self) -> None:
        chat = AsyncMock(
            return_value=(
                '{"white_background":"white prompt",'
                '"lifestyle_scene":"scene prompt"}'
            )
        )
        submit = AsyncMock(side_effect=["task-1", "task-2"])
        with (
            patch("app.main.grsai.chat_completion", chat),
            patch("app.main.grsai.submit_draw", submit),
        ):
            response = self.client.post(
                "/api/image-sets/generate",
                data={
                    "prompt": "A waterproof commuter backpack",
                    "platform": "amazon",
                    "template_ids": '["white_background","lifestyle_scene"]',
                    "quality": "high",
                },
                files={"image": ("product.png", PNG_1X1, "image/png")},
            )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["template_ids"], ["white_background", "lifestyle_scene"])
        self.assertEqual(
            [task["task_id"] for task in body["tasks"]], ["task-1", "task-2"]
        )
        first_submit = submit.await_args_list[0].kwargs
        self.assertTrue(first_submit["urls"][0].startswith("data:image/png;base64,"))

    def test_explicit_aspect_ratio_overrides_platform(self) -> None:
        submit = AsyncMock(return_value="task-1")
        with patch("app.main.grsai.submit_draw", submit):
            response = self.client.post(
                "/api/image-sets/generate",
                data={
                    "prompt": "Minimal ceramic coffee cup",
                    "platform": "zalando",
                    "template_ids": "white_background",
                    "auto_prompts": "false",
                    "aspect_ratio": "1536x1024",
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(submit.await_args.kwargs["aspect_ratio"], "1536x1024")

    def test_rejects_unknown_template(self) -> None:
        response = self.client.post(
            "/api/image-sets/generate",
            data={
                "prompt": "A product",
                "platform": "custom",
                "template_ids": "not-a-template",
            },
        )

        self.assertEqual(response.status_code, 422)
        self.assertIn("Unknown template_ids", response.text)

    def test_rejects_unsupported_image(self) -> None:
        response = self.client.post(
            "/api/image-sets/generate",
            data={"prompt": "A product", "platform": "custom"},
            files={"image": ("product.txt", b"not an image", "text/plain")},
        )

        self.assertEqual(response.status_code, 415)

    def _submit_one(self, submit) -> str:
        with patch("app.main.grsai.submit_draw", submit):
            response = self.client.post(
                "/api/image-sets/generate",
                data={
                    "prompt": "A product",
                    "platform": "custom",
                    "template_ids": "white_background",
                    "auto_prompts": "false",
                },
            )
        self.assertEqual(response.status_code, 200)
        return response.json()["tasks"][0]["task_id"]

    def test_result_auto_retries_failed_generation(self) -> None:
        submit = AsyncMock(side_effect=["task-1", "task-2"])
        task_id = self._submit_one(submit)
        self.assertEqual(task_id, "task-1")

        failed = {"data": {"status": "failed", "progress": 0, "results": [],
                            "failure_reason": "google gemini timeout", "error": ""}}
        with patch("app.main.grsai.submit_draw", submit), \
                patch("app.main.grsai.get_result", AsyncMock(return_value=failed)):
            res = self.client.post("/api/result", json={"ids": [task_id]}).json()
        entry = res["results"][task_id]
        self.assertEqual(entry["status"], "retrying")
        self.assertEqual(entry["attempt"], 2)
        # resubmitted under the same public id
        self.assertEqual(main._retry_registry[task_id].current_id, "task-2")

        succeeded = {"data": {"status": "succeeded", "progress": 100,
                              "results": [{"url": "https://example.com/x.png"}],
                              "failure_reason": "", "error": ""}}
        with patch("app.main.grsai.get_result", AsyncMock(return_value=succeeded)):
            res = self.client.post("/api/result", json={"ids": [task_id]}).json()
        self.assertEqual(res["results"][task_id]["status"], "succeeded")
        self.assertNotIn(task_id, main._retry_registry)

    def test_result_gives_up_after_max_attempts(self) -> None:
        submit = AsyncMock(side_effect=[f"task-{i}" for i in range(10)])
        task_id = self._submit_one(submit)
        failed = {"data": {"status": "failed", "progress": 0, "results": [],
                            "failure_reason": "boom", "error": ""}}
        statuses = []
        with patch("app.main.grsai.submit_draw", submit), \
                patch("app.main.grsai.get_result", AsyncMock(return_value=failed)):
            for _ in range(6):
                res = self.client.post("/api/result", json={"ids": [task_id]}).json()
                statuses.append(res["results"][task_id]["status"])
        # 4 retries (attempts 2..5) then a terminal failed once budget is exhausted
        self.assertEqual(statuses.count("retrying"), 4)
        self.assertEqual(statuses[-1], "failed")
        self.assertNotIn(task_id, main._retry_registry)

    def test_result_passes_through_unregistered_ids(self) -> None:
        succeeded = {"data": {"status": "succeeded", "progress": 100,
                              "results": [{"url": "https://example.com/y.png"}]}}
        with patch("app.main.grsai.get_result", AsyncMock(return_value=succeeded)):
            res = self.client.post("/api/result", json={"ids": ["external-id"]}).json()
        self.assertEqual(res["results"]["external-id"]["status"], "succeeded")


if __name__ == "__main__":
    unittest.main()
