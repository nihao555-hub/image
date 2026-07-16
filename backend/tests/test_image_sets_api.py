import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.main import app


PNG_HEADER = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16


class GenerateImageSetApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)

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
                files={"image": ("product.png", PNG_HEADER, "image/png")},
            )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["template_ids"], ["white_background", "lifestyle_scene"])
        self.assertEqual(
            [task["task_id"] for task in body["tasks"]], ["task-1", "task-2"]
        )
        first_submit = submit.await_args_list[0].kwargs
        self.assertTrue(first_submit["urls"][0].startswith("data:image/png;base64,"))

    def test_can_skip_llm_prompt_expansion(self) -> None:
        submit = AsyncMock(return_value="task-1")
        with (
            patch("app.main.grsai.chat_completion", AsyncMock()) as chat,
            patch("app.main.grsai.submit_draw", submit),
        ):
            response = self.client.post(
                "/api/image-sets/generate",
                data={
                    "prompt": "Minimal ceramic coffee cup",
                    "platform": "custom",
                    "template_ids": "white_background",
                    "auto_prompts": "false",
                },
            )

        self.assertEqual(response.status_code, 200)
        chat.assert_not_awaited()
        self.assertIn(
            "Minimal ceramic coffee cup",
            response.json()["prompts"]["white_background"],
        )

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
