"""Storyboard image stitching, splitting, and manipulation."""
import logging
from pathlib import Path
from typing import List, Tuple, Union
import numpy as np
from PIL import Image, ImageDraw, ImageFont

logger = logging.getLogger(__name__)


def stitch_storyboard(
    frames: Union[List[dict], List[Image.Image]],
    target_size: Tuple[int, int] = (1920, 1080),
) -> Tuple[Image.Image, str]:
    """
    将关键帧拼接成4x4网格布局（固定16帧）。

    Args:
        frames: 两种格式均可：
            - [{"time": 1.5, "image": numpy_array}, ...]  (原始帧 dict 列表)
            - [PIL.Image.Image, ...]                       (PIL Image 列表)
        target_size: 输出画布大小 (width, height)，会根据帧比例自动调整

    Returns:
        (canvas_image, layout_str)
    """
    n = len(frames)
    if n == 0:
        raise ValueError("No frames to stitch")

    # Normalise input: convert everything to PIL Images
    pil_frames: List[Image.Image] = []
    for item in frames:
        if isinstance(item, dict):
            pil_frames.append(Image.fromarray(item['image']))
        elif isinstance(item, Image.Image):
            pil_frames.append(item)
        else:
            raise TypeError(f"Unsupported frame type: {type(item)}")

    first_frame = pil_frames[0]
    frame_ratio = first_frame.width / first_frame.height

    rows, cols = 4, 4
    cell_width = 480
    cell_height = int(cell_width / frame_ratio)

    canvas_width = cols * cell_width
    canvas_height = rows * cell_height

    canvas = Image.new('RGB', (canvas_width, canvas_height), (240, 240, 240))

    for idx, img in enumerate(pil_frames):
        if idx >= 16:
            break

        row = idx // cols
        col = idx % cols

        img_resized = img.resize((cell_width, cell_height), Image.Resampling.LANCZOS)

        x = col * cell_width
        y = row * cell_height
        canvas.paste(img_resized, (x, y))

    layout_str = "4x4"
    return canvas, layout_str


def split_storyboard(
    storyboard_path: str,
    layout: str = "4x4",
) -> List[Image.Image]:
    """
    将拼接好的分镜图拆分为独立的帧图片列表。

    Args:
        storyboard_path: 分镜拼接图路径（本地文件）
        layout: 布局字符串，目前支持 "4x4"

    Returns:
        按从左到右、从上到下顺序排列的 PIL Image 列表（共 rows*cols 帧）

    Raises:
        ValueError: 不支持的 layout 字符串
        FileNotFoundError: 文件不存在
    """
    if layout != "4x4":
        raise ValueError(f"Unsupported layout: {layout!r}. Only '4x4' is supported.")

    rows, cols = 4, 4
    img = Image.open(storyboard_path).convert("RGB")

    canvas_width, canvas_height = img.size
    cell_width = canvas_width // cols
    cell_height = canvas_height // rows

    frames: List[Image.Image] = []
    for row in range(rows):
        for col in range(cols):
            left = col * cell_width
            upper = row * cell_height
            right = left + cell_width
            lower = upper + cell_height
            cell = img.crop((left, upper, right, lower))
            frames.append(cell)

    logger.debug("split_storyboard: extracted %d frames from %s", len(frames), storyboard_path)
    return frames


def add_timestamp_label(img: Image.Image, timestamp: float) -> Image.Image:
    """
    在图片左上角添加时间戳标注

    Args:
        img: PIL Image对象
        timestamp: 时间戳（秒）

    Returns:
        添加了标注的新图片
    """
    img_copy = img.copy()
    draw = ImageDraw.Draw(img_copy)

    timestamp_text = f"{timestamp:.1f}s"

    try:
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 40)
    except OSError:
        try:
            font = ImageFont.truetype("/System/Library/Fonts/PingFang.ttc", 40)
        except OSError:
            font = ImageFont.load_default()

    x_text, y_text = 20, 20

    for dx in [-2, 0, 2]:
        for dy in [-2, 0, 2]:
            if dx != 0 or dy != 0:
                draw.text(
                    (x_text + dx, y_text + dy),
                    timestamp_text,
                    fill='black',
                    font=font,
                )

    draw.text((x_text, y_text), timestamp_text, fill='white', font=font)

    return img_copy
