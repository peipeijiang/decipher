import requests
import time
from typing import Optional


class ImageGeneratorService:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://api.laozhang.ai/v1"
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }

    def generate_image(
        self,
        prompt: str,
        model: str = "laozhang-image-2-vip",
        size: str = "1024x1024",
        grid_layout: str = "single",
    ) -> dict:
        """Generate image from text prompt"""
        try:
            # Adjust size for grid layouts
            if grid_layout in ["2x3", "3x2"]:
                size = "1536x1024"

            # Modify prompt for grid layouts
            final_prompt = prompt
            if grid_layout in ["2x3", "3x2"]:
                final_prompt = f"Create a {grid_layout} storyboard grid. {prompt}"

            # Submit generation request
            response = requests.post(
                f"{self.base_url}/images/generations",
                headers=self.headers,
                json={
                    "model": model,
                    "prompt": final_prompt,
                    "n": 1,
                    "size": size,
                    "quality": "hd"
                },
                timeout=30
            )
            response.raise_for_status()
            data = response.json()

            # Check if synchronous response
            if "data" in data and len(data["data"]) > 0:
                item = data["data"][0]
                # Handle both url and b64_json responses
                if "url" in item:
                    return {
                        "status": "completed",
                        "image_url": item["url"],
                        "task_id": None
                    }
                elif "b64_json" in item:
                    # Save base64 image to temp file and return path
                    import base64
                    import tempfile
                    import os
                    image_data = base64.b64decode(item["b64_json"])
                    with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as f:
                        f.write(image_data)
                        temp_path = f.name
                    return {
                        "status": "completed",
                        "image_url": f"file://{temp_path}",
                        "task_id": None
                    }

            # Async response - poll for result
            task_id = data.get("id")
            if not task_id:
                raise Exception("No task_id, url, or b64_json in response")

            return self._poll_task(task_id)

        except Exception as e:
            raise Exception(f"Image generation failed: {str(e)}")

    def _poll_task(self, task_id: str, max_attempts: int = 60) -> dict:
        """Poll task status until completion"""
        for attempt in range(max_attempts):
            try:
                response = requests.get(
                    f"{self.base_url}/images/generations/{task_id}",
                    headers=self.headers,
                    timeout=10
                )
                response.raise_for_status()
                data = response.json()

                status = data.get("status")
                if status == "succeeded":
                    item = data["data"][0]
                    # Handle both url and b64_json responses
                    if "url" in item:
                        return {
                            "status": "completed",
                            "image_url": item["url"],
                            "task_id": task_id
                        }
                    elif "b64_json" in item:
                        # Save base64 image to temp file
                        import base64
                        import tempfile
                        image_data = base64.b64decode(item["b64_json"])
                        with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as f:
                            f.write(image_data)
                            temp_path = f.name
                        return {
                            "status": "completed",
                            "image_url": f"file://{temp_path}",
                            "task_id": task_id
                        }
                elif status == "failed":
                    raise Exception(f"Generation failed: {data.get('error', 'Unknown error')}")

                # Still processing, wait and retry
                time.sleep(2)

            except Exception as e:
                if attempt == max_attempts - 1:
                    raise Exception(f"Polling failed: {str(e)}")
                time.sleep(2)

        raise Exception("Image generation timeout after 120s")

    def download_image(self, image_url: str, save_path: str) -> str:
        """Download generated image to local path"""
        try:
            # Handle local file:// URLs (b64_json responses saved to temp file)
            if image_url.startswith("file://"):
                import shutil
                src = image_url[len("file://"):]
                shutil.copy2(src, save_path)
                return save_path

            response = requests.get(image_url, timeout=30)
            response.raise_for_status()

            with open(save_path, "wb") as f:
                f.write(response.content)

            return save_path

        except Exception as e:
            raise Exception(f"Image download failed: {str(e)}")
