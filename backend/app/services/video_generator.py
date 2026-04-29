import requests
import time
from typing import Optional


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
        image_url: str,
        prompt: str,
        model: str = "seedance-2.0",
        reference_images: Optional[list[str]] = None,
    ) -> dict:
        """Generate video from image + prompt (Seedance 2.0 via Volcengine)"""
        try:
            # Build content array
            content = [{"type": "text", "text": prompt}]
            if image_url:
                content.append({"type": "image_url", "image_url": image_url})
            if reference_images:
                for ref_img in reference_images:
                    content.append({"type": "image_url", "image_url": ref_img})

            # Submit generation request with correct endpoint and format
            payload = {
                "model": "dreamina-seedance-2-0-260128",
                "content": content,
                "ratio": "9:16",
                "resolution": "720p",
                "duration": 5,
                "generate_audio": False
            }

            response = requests.post(
                f"{self.base_url}/contents/generations/tasks",
                headers=self.headers,
                json=payload,
                timeout=30
            )
            response.raise_for_status()
            data = response.json()

            task_id = data.get("task_id")
            if not task_id:
                raise Exception("No task_id in response")

            # Poll for result
            return self._poll_task(task_id)

        except Exception as e:
            raise Exception(f"Video generation failed: {str(e)}")

    def _poll_task(self, task_id: str, max_attempts: int = 120) -> dict:
        """Poll task status until completion (video takes longer)"""
        for attempt in range(max_attempts):
            try:
                response = requests.get(
                    f"{self.base_url}/contents/generations/tasks/{task_id}",
                    headers=self.headers,
                    timeout=10
                )
                response.raise_for_status()
                data = response.json()

                status = data.get("status")
                if status == "succeeded":
                    video_url = data.get("content", {}).get("video_url")
                    return {
                        "status": "completed",
                        "video_url": video_url,
                        "task_id": task_id
                    }
                elif status == "failed":
                    raise Exception(
                        f"Generation failed: {data.get('error', 'Unknown error')}"
                    )

                # Still processing, wait and retry
                time.sleep(3)

            except Exception as e:
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
