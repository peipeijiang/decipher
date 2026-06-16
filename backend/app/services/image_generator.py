import requests
import time
import os
from typing import Optional


class ImageGeneratorService:
    def __init__(self, api_key: str, base_url: str = "https://api.laozhang.ai/v1"):
        self.api_key = api_key
        self.base_url = base_url
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }

    def _request(self, method: str, url: str, **kwargs) -> requests.Response:
        """Make a request bypassing proxy env vars and SSL issues."""
        old_env = {}
        for k in list(os.environ.keys()):
            if 'proxy' in k.lower():
                old_env[k] = os.environ.pop(k)
        try:
            kwargs.setdefault('proxies', {'http': None, 'https': None})
            kwargs.setdefault('verify', False)
            return requests.request(method, url, **kwargs)
        finally:
            os.environ.update(old_env)

    def generate_image(
        self,
        prompt: str,
        model: str = "laozhang-image-2-vip",
        size: str = "1024x1024",
        grid_layout: str = "single",
        aspect_ratio: str = "1:1",
    ) -> dict:
        """Generate image from text prompt"""
        try:
            # Calculate size based on aspect_ratio
            SIZE_MAP = {
                "16:9": "1792x1024",
                "9:16": "1024x1792",
                "1:1": "1024x1024",
            }
            size = SIZE_MAP.get(aspect_ratio, "1024x1024")

            # Adjust size for grid layouts
            if grid_layout in ["2x3", "3x2", "3x3", "3x4", "4x3", "4x4"]:
                GRID_SIZE_MAP = {
                    "16:9": "1792x1024",
                    "9:16": "1024x1792",
                    "1:1": "1536x1536",
                }
                size = GRID_SIZE_MAP.get(aspect_ratio, "1536x1024")

            # Modify prompt for grid layouts — strict grid enforcement
            final_prompt = prompt
            if grid_layout in ["2x3", "3x2", "3x3", "3x4", "4x3", "4x4"]:
                panel_rows = int(grid_layout[0])
                panel_cols = int(grid_layout[2])
                panel_count = panel_rows * panel_cols
                final_prompt = f"STRICTLY a {panel_rows}-column by {panel_cols}-row grid = EXACTLY {panel_count} equal panels. DO NOT output any other grid arrangement. No text captions, no labels on any panel. No subtitles, no dialogue as text. Only Instagram-style thin sans-serif overlay (2-3 words, no stroke). Clean gutters. {prompt}"

            # Submit generation request
            response = self._request(
                "POST",
                f"{self.base_url}/images/generations",
                headers=self.headers,
                json={
                    "model": model,
                    "prompt": final_prompt,
                    "n": 1,
                    "size": size,
                },
                timeout=300
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
                response = self._request(
                    "GET",
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

    def generate_image_with_reference(
        self,
        prompt: str,
        reference_image_path: str,
        model: str = "gpt-image-2-vip",
        size: str = "1024x1024",
        grid_layout: str = "single",
        aspect_ratio: str = "1:1",
        additional_references: list = None,  # NEW: support multiple reference images
    ) -> dict:
        """Generate image using reference image(s) via images/edits endpoint (multipart upload)."""
        try:
            SIZE_MAP = {"16:9": "1792x1024", "9:16": "auto", "1:1": "1024x1024"}
            size = SIZE_MAP.get(aspect_ratio, "auto")
            if grid_layout in ["2x3", "3x2", "3x3", "3x4", "4x3", "4x4"]:
                GRID_SIZE_MAP = {"16:9": "1792x1024", "9:16": "auto", "1:1": "1536x1536"}
                size = GRID_SIZE_MAP.get(aspect_ratio, "1536x1024")
            elif grid_layout == "story_flow_5":
                size = "1792x1024"  # 16:9 horizontal
            elif grid_layout == "industrial_macro_5":
                size = "1024x1792"  # 9:16 vertical

            # For images/edits with reference image, use the full prompt as-is
            final_prompt = prompt

            # Add grid layout instruction — strict grid enforcement
            if grid_layout in ["2x3", "3x2", "3x3", "3x4", "4x3", "4x4"]:
                panel_rows = int(grid_layout[0])
                panel_cols = int(grid_layout[2])
                panel_count = panel_rows * panel_cols
                final_prompt = f"STRICTLY a {panel_rows}-column by {panel_cols}-row grid = EXACTLY {panel_count} equal panels. DO NOT output any other grid arrangement. No text captions, no labels on any panel. Clean gutters. {final_prompt}"

            # Prepend reference image instruction
            final_prompt = f"Photorealistic style, real photography, not illustration, not cartoon, not anime. The product in this reference image must appear EXACTLY as-is in every panel - same shape, color, texture. Do not alter the product. OVERLAY TEXT RULES: Only minimalist Instagram-style text overlays allowed — thin sans-serif lowercase, no bold, no stroke, no shadow, placed creatively in corners. Maximum 2-3 short words per panel. NEVER render dialogue as on-screen text. NEVER add subtitles, captions, speech bubbles, large paragraphs, or watermarks. The image must look like a clean social-media ad, not a video screenshot. {final_prompt}"

            # Use images/edits endpoint with multipart/form-data (retry on connection errors)
            import time as _time
            last_err = None
            for attempt in range(5):
                try:
                    # Build files array: primary reference + additional references
                    files = []
                    with open(reference_image_path, 'rb') as img_file:
                        files.append(('image[]', ('product.png', img_file.read(), 'image/png')))

                    # Add additional reference images (e.g., instruction board)
                    if additional_references:
                        for idx, ref_path in enumerate(additional_references):
                            try:
                                with open(ref_path, 'rb') as ref_file:
                                    files.append(('image[]', (f'reference_{idx}.png', ref_file.read(), 'image/png')))
                            except Exception as e:
                                import logging
                                logging.getLogger(__name__).warning(f"Failed to load additional reference {ref_path}: {e}")

                    response = self._request(
                        "POST",
                        f"{self.base_url}/images/edits",
                        headers={"Authorization": f"Bearer {self.api_key}"},
                        files=files,
                        data={
                            'model': model,
                            'prompt': final_prompt,
                            'n': '1',
                            'size': size,
                        },
                        timeout=600,
                    )
                    break  # Success, exit retry loop
                except Exception as e:
                    last_err = e
                    if attempt < 4:
                        wait = 15 * (attempt + 1)  # 15s, 30s, 45s, 60s
                        import logging
                        logging.getLogger(__name__).warning(
                            "Image generation attempt %d failed: %s. Retrying in %ds...",
                            attempt + 1, str(e)[:100], wait
                        )
                        _time.sleep(wait)
                        continue
                    raise last_err

            if response.status_code != 200:
                import logging
                logging.getLogger(__name__).error(
                    "Image edit API error %d: %s", response.status_code, response.text[:500]
                )
            response.raise_for_status()
            data = response.json()

            if "data" in data and len(data["data"]) > 0:
                item = data["data"][0]
                if "url" in item:
                    return {"status": "completed", "image_url": item["url"], "task_id": None}
                elif "b64_json" in item:
                    import base64, tempfile
                    image_data = base64.b64decode(item["b64_json"])
                    with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as f:
                        f.write(image_data)
                        temp_path = f.name
                    return {"status": "completed", "image_url": f"file://{temp_path}", "task_id": None}

            task_id = data.get("id")
            if task_id:
                return self._poll_task(task_id)
            raise Exception("No task_id, url, or b64_json in response")

        except Exception as e:
            raise Exception(f"Image generation with reference failed: {str(e)}")

    def generate_aliyun_image_with_reference(
        self,
        prompt: str,
        reference_image_path: str,
        model: str = "qwen-image-2.0-pro",
        grid_layout: str = "single",
        aspect_ratio: str = "1:1",
        additional_references: list = None,
    ) -> dict:
        """Generate image via Aliyun DashScope using one or more reference images."""
        try:
            import base64
            import mimetypes
            from dashscope import MultiModalConversation
            import dashscope

            dashscope.base_http_api_url = 'https://dashscope.aliyuncs.com/api/v1'

            def _image_part(path: str) -> dict:
                with open(path, "rb") as f:
                    data = f.read()
                mime, _ = mimetypes.guess_type(path)
                mime = mime or "image/jpeg"
                return {"image": f"data:{mime};base64,{base64.b64encode(data).decode()}"}

            size_map = {
                "16:9": "1792*1024",
                "9:16": "1024*1792",
                "1:1": "1024*1024",
            }
            size = size_map.get(aspect_ratio, "1024*1024")
            if grid_layout in ["3x2", "4x3"]:
                size = "1792*1024"
            elif grid_layout in ["2x3", "3x4"]:
                size = "1024*1792"

            final_prompt = prompt
            if grid_layout in ["2x3", "3x2", "3x3", "3x4", "4x3", "4x4"]:
                panel_rows = int(grid_layout[0])
                panel_cols = int(grid_layout[2])
                panel_count = panel_rows * panel_cols
                final_prompt = (
                    f"STRICTLY a {panel_rows}-column by {panel_cols}-row grid = EXACTLY {panel_count} equal panels. "
                    f"DO NOT output any other grid arrangement. "
                    f"No text captions, no labels on any panel. Clean gutters. "
                    f"{final_prompt}"
                )

            final_prompt = (
                "Use the first reference image as the exact product identity reference. Preserve product shape, "
                "color, material, logo/markings, proportions, and distinctive details. "
                "Create a polished commercial social-media image. "
                "OVERLAY TEXT: Only minimalist Instagram-style thin sans-serif text overlays — maximum 2-3 short words per panel, "
                "placed in corners. NEVER render dialogue as on-screen text. NEVER add subtitles, captions, speech bubbles, "
                "or large text blocks. No bold, no stroke, no shadow on text. "
                f"{final_prompt}"
            )

            content = [_image_part(reference_image_path)]
            for ref_path in additional_references or []:
                try:
                    content.append(_image_part(ref_path))
                except Exception:
                    pass
            content.append({"text": final_prompt})

            response = MultiModalConversation.call(
                api_key=self.api_key,
                model=model,
                messages=[{"role": "user", "content": content}],
                stream=False,
                n=1,
                size=size,
            )

            if response.status_code != 200:
                raise RuntimeError(f"{getattr(response, 'code', 'Error')} - {getattr(response, 'message', '')}")

            image_url = None
            for item in response.output.choices[0].message.content:
                if "image" in item:
                    image_url = item["image"]
                    break
            if not image_url:
                raise RuntimeError("Aliyun returned no image output")

            return {"status": "completed", "image_url": image_url, "task_id": None}
        except Exception as e:
            raise Exception(f"Aliyun image generation failed: {str(e)}")

    def download_image(self, image_url: str, save_path: str) -> str:
        """Download generated image to local path"""
        try:
            # Handle local file:// URLs (b64_json responses saved to temp file)
            if image_url.startswith("file://"):
                import shutil
                src = image_url[len("file://"):]
                shutil.copy2(src, save_path)
                return save_path

            response = self._request("GET", image_url, timeout=30)
            response.raise_for_status()

            with open(save_path, "wb") as f:
                f.write(response.content)

            return save_path

        except Exception as e:
            raise Exception(f"Image download failed: {str(e)}")
