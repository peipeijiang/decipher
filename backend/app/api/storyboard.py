"""Storyboard replication API endpoints."""
import logging
import threading
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.storyboard_replication import StoryboardReplication
from app.models.video import Video

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/storyboard", tags=["storyboard"])


@router.post("/create")
async def create_storyboard_replication(
    video_id: str,
    db: Session = Depends(get_db)
):
    """
    创建分镜复刻任务并启动后台提取

    Args:
        video_id: 视频ID

    Returns:
        任务信息
    """
    # 检查视频是否存在
    video = db.get(Video, video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    # 检查是否已存在任务
    existing = db.query(StoryboardReplication).filter(
        StoryboardReplication.video_id == video_id
    ).first()

    if existing:
        return {
            "id": existing.id,
            "status": existing.status,
            "message": "Task already exists"
        }

    # 创建新任务
    replication = StoryboardReplication(video_id=video_id, status="pending")
    db.add(replication)
    db.commit()
    db.refresh(replication)

    # 启动后台任务
    from app.tasks.storyboard_pipeline import extract_keyframes_pipeline
    threading.Thread(
        target=extract_keyframes_pipeline,
        args=(replication.id,),
        daemon=True
    ).start()

    logger.info("Created storyboard replication task: %s", replication.id)

    return {
        "id": replication.id,
        "status": replication.status,
        "message": "Task created successfully"
    }


@router.get("/by-video/{video_id}")
async def get_storyboard_by_video(video_id: str, db: Session = Depends(get_db)):
    """根据 video_id 获取最新的分镜复刻记录"""
    replication = (
        db.query(StoryboardReplication)
        .filter(StoryboardReplication.video_id == video_id)
        .order_by(StoryboardReplication.created_at.desc())
        .first()
    )

    if not replication:
        raise HTTPException(status_code=404, detail="No storyboard replication found for this video")

    result = {
        "id": str(replication.id),
        "status": replication.status,
        "frame_count": replication.frame_count,
        "layout_grid": replication.layout_grid,
        "storyboard_image_url": (
            f"/api/storyboard/{replication.id}/image"
            if replication.storyboard_image_path
            else None
        ),
        "error": replication.error,
    }

    if replication.status == "completed":
        result.update({
            "replaced_storyboard_url": f"/api/storyboard/{replication.id}/replaced-image",
            "compressed_prompt": replication.compressed_prompt,
            "original_duration": replication.original_duration,
        })

    return result


@router.get("/history")
async def get_storyboard_history(limit: int = 50, db: Session = Depends(get_db)):
    """获取分镜复刻历史记录"""
    replications = db.query(StoryboardReplication).order_by(
        StoryboardReplication.created_at.desc()
    ).limit(limit).all()

    result = []
    for r in replications:
        video = db.get(Video, r.video_id) if r.video_id else None
        result.append({
            "id": str(r.id),
            "video_id": str(r.video_id) if r.video_id else None,
            "video_filename": video.filename if video else None,
            "frame_count": r.frame_count,
            "layout_grid": r.layout_grid,
            "status": r.status,
            "error": r.error,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        })

    return result


@router.get("/{replication_id}")
async def get_storyboard_replication(
    replication_id: str,
    db: Session = Depends(get_db)
):
    """
    获取分镜复刻任务状态和预览

    Args:
        replication_id: 任务ID

    Returns:
        任务详情
    """
    replication = db.get(StoryboardReplication, replication_id)
    if not replication:
        raise HTTPException(status_code=404, detail="Replication not found")

    response = {
        "id": replication.id,
        "video_id": replication.video_id,
        "status": replication.status,
        "frame_count": replication.frame_count,
        "frame_timestamps": replication.frame_timestamps,
        "storyboard_image_url": (
            f"/api/storyboard/{replication_id}/image"
            if replication.storyboard_image_path
            else None
        ),
        "layout_grid": replication.layout_grid,
        "error": replication.error,
        "created_at": replication.created_at.isoformat() if replication.created_at else None,
        "updated_at": replication.updated_at.isoformat() if replication.updated_at else None,
    }

    if replication.status == "completed":
        response.update({
            "replaced_storyboard_url": f"/api/storyboard/{replication_id}/replaced-image",
            "compressed_prompt": replication.compressed_prompt,
            "original_duration": replication.original_duration,
            "compressed_duration": replication.compressed_duration,
        })

    return response


@router.get("/{replication_id}/image")
async def get_storyboard_image(
    replication_id: str,
    db: Session = Depends(get_db)
):
    """
    返回拼接后的分镜图

    Args:
        replication_id: 任务ID

    Returns:
        图片文件
    """
    replication = db.get(StoryboardReplication, replication_id)
    if not replication or not replication.storyboard_image_path:
        raise HTTPException(status_code=404, detail="Storyboard image not found")

    image_path = Path(replication.storyboard_image_path)
    if not image_path.exists():
        raise HTTPException(status_code=404, detail="Image file not found on disk")

    return FileResponse(
        path=str(image_path),
        media_type="image/jpeg",
        filename=f"storyboard_{replication_id}.jpg"
    )


@router.post("/{replication_id}/generate")
async def generate_storyboard_replacement(
    replication_id: str,
    file: UploadFile = File(...),
    description: str = Form(""),
    image_model: str = Form("laozhang-image-2-vip"),
    db: Session = Depends(get_db),
):
    """提交产品图并启动产品替换 + 提示词压缩。

    Args:
        replication_id: 任务ID（必须处于 ready 状态）
        file: 产品图文件
        description: 产品文字描述（可选）
        image_model: 图片生成模型（laozhang-image-2-vip 或 updrama-image-2）

    Returns:
        启动状态
    """
    from app.tasks.storyboard_pipeline import product_replacement_pipeline

    replication = db.get(StoryboardReplication, replication_id)
    if not replication:
        raise HTTPException(status_code=404, detail="Replication not found")
    if replication.status != "ready":
        raise HTTPException(
            status_code=400,
            detail=f"Replication not ready, current status: {replication.status}",
        )

    # 保存产品图
    product_dir = Path("data/storyboards") / replication_id
    product_dir.mkdir(parents=True, exist_ok=True)
    safe_filename = Path(file.filename).name if file.filename else "product.jpg"
    product_path = product_dir / f"product_{safe_filename}"
    content = await file.read()
    product_path.write_bytes(content)

    # 更新数据库
    replication.product_image_path = str(product_path)
    replication.product_description = description
    replication.status = "generating"
    db.commit()

    logger.info(
        "Starting product replacement for replication %s with model %s, product saved to %s",
        replication_id,
        image_model,
        product_path,
    )

    # 启动后台生成任务，传入模型参数
    threading.Thread(
        target=product_replacement_pipeline,
        args=(replication_id, image_model),
        daemon=True,
    ).start()

    return {"status": "generating", "id": replication_id}


@router.get("/{replication_id}/replaced-image")
async def get_replaced_storyboard_image(
    replication_id: str,
    db: Session = Depends(get_db),
):
    """返回产品替换后的分镜图。

    Args:
        replication_id: 任务ID

    Returns:
        替换后的图片文件
    """
    replication = db.get(StoryboardReplication, replication_id)
    if not replication or not replication.replaced_storyboard_path:
        raise HTTPException(status_code=404, detail="Replaced storyboard image not found")

    path = Path(replication.replaced_storyboard_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")

    return FileResponse(
        path=str(path),
        media_type="image/jpeg",
        filename=f"replaced_storyboard_{replication_id}.jpg",
    )


@router.delete("/{replication_id}")

async def delete_storyboard_replication(
    replication_id: str,
    db: Session = Depends(get_db)
):
    """
    删除分镜复刻任务及相关文件

    Args:
        replication_id: 任务ID

    Returns:
        删除结果
    """
    replication = db.get(StoryboardReplication, replication_id)
    if not replication:
        raise HTTPException(status_code=404, detail="Replication not found")

    # 删除文件
    if replication.storyboard_image_path:
        try:
            storyboard_dir = Path(replication.storyboard_image_path).parent.parent
            if storyboard_dir.exists():
                import shutil
                shutil.rmtree(storyboard_dir)
        except Exception as e:
            logger.warning("Failed to delete files for %s: %s", replication_id, e)

    # 删除数据库记录
    db.delete(replication)
    db.commit()

    return {"message": "Storyboard replication deleted successfully"}

