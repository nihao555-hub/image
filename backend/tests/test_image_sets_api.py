import base64
import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app import auth
from app.main import app


PNG_1X1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAS"
    "cY42YAAAAASUVORK5CYII="
)


class GenerateImageSetApiTest(unittest.TestCase):
    def setUp(self) -> None:
        app.dependency_overrides[auth.require_user] = lambda: 1
        self.client = TestClient(app)

    def tearDown(self) -> None:
        app.dependency_overrides.clear()

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


if __name__ == "__main__":
    unittest.main()
