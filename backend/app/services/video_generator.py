import requests
import time
import base64
import logging
from typing import Optional

logger = logging.getLogger(__name__)


class VideoGeneratorService:
    def __init__(self, api_key: str, base_url: str = "https://ark.cn-beijing.volces.com/api/v3"):
        self.api_key = api_key
        self.base_url = base_url
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }

    def generate_video(
        self,
        image_url: str = None,
        prompt: str = "",
        model: str = "seedance-2.0",
        reference_images: Optional[list[str]] = None,
        duration: int = 5,
        local_image_path: str = None,
    ) -> dict:
        """Generate video from image + prompt (Seedance 2.0 via Volcengine)"""
        try:
            # Build content array
            content = [{"type": "text", "text": prompt}]

            # Add image: prefer URL, fallback to base64 from local file
            if image_url:
                content.append({"type": "image_url", "image_url": {"url": image_url}})
            elif local_image_path:
                with open(local_image_path, 'rb') as f:
                    img_b64 = base64.b64encode(f.read()).decode()
                data_url = f"data:image/png;base64,{img_b64}"
                content.append({"type": "image_url", "image_url": {"url": data_url}})

            if reference_images:
                for ref_img in reference_images:
                    content.append({"type": "image_url", "image_url": {"url": ref_img}})

            # Submit generation request
            payload = {
                "model": "doubao-seedance-2-0-260128",
                "content": content,
                "ratio": "9:16",
                "resolution": "720p",
                "duration": duration,
                "generate_audio": False,
            }

            logger.info("Submitting Seedance 2.0 task to %s/contents/generations/tasks", self.base_url)
            response = requests.post(
                f"{self.base_url}/contents/generations/tasks",
                headers=self.headers,
                json=payload,
                timeout=30
            )
            response.raise_for_status()
            data = response.json()

            task_id = data.get("id") or data.get("task_id")
            if not task_id:
                raise Exception(f"No task_id in response: {data}")

            logger.info("Seedance 2.0 task submitted: %s", task_id)
            return self._poll_task(task_id)

        except Exception as e:
            raise Exception(f"Video generation failed: {str(e)}")

    def _poll_task(self, task_id: str, max_attempts: int = 120) -> dict:
        """Poll task status until completion"""
        for attempt in range(max_attempts):
            try:
                response = requests.get(
                    f"{self.base_url}/contents/generations/tasks/{task_id}",
                    headers=self.headers,
                    timeout=10
                )
                response.raise_for_status()
                data = response.json()

                status = data.get("status", "")
                if status == "succeeded":
                    video_url = data.get("content", {}).get("video_url")
                    return {
                        "status": "completed",
                        "video_url": video_url,
                        "task_id": task_id
                    }
                elif status in ("failed", "expired", "cancelled"):
                    error_msg = data.get("error", {}).get("message", "Unknown error")
                    raise Exception(f"Generation {status}: {error_msg}")

                # queued / running → keep polling
                time.sleep(3)

            except requests.exceptions.HTTPError as e:
                if attempt == max_attempts - 1:
                    raise Exception(f"Polling failed: {str(e)}")
                time.sleep(3)

        raise Exception("Video generation timeout after 360s")

    def download_video(self, video_url: str, save_path: str) -> str:
        """Download generated video to local path"""
        try:
            response = requests.get(video_url, timeout=60)
            response.raise_for_status()
            with open(save_path, "wb") as f:
                f.write(response.content)
            return save_path
        except Exception as e:
            raise Exception(f"Video download failed: {str(e)}")
