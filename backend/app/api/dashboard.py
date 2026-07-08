"""Dashboard stats aggregator — provides overview counts and recent activity."""

from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db

router = APIRouter(prefix="/api", tags=["dashboard"])


@router.get("/dashboard")
def get_dashboard(db: Session = Depends(get_db)):
    video_counts = _counts(db, "videos")
    product_counts = _counts(db, "products")
    creative_counts = _counts_creative(db)
    gen_counts = _counts(db, "video_generations")
    recent = _recent_activity(db)

    return {
        "stats": {
            "videos": video_counts,
            "products": product_counts,
            "creative": creative_counts,
            "video_gen": gen_counts,
        },
        "recent": recent,
    }


def _counts(db: Session, table: str) -> dict:
    try:
        total = db.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar() or 0
        completed = db.execute(
            text(f"SELECT COUNT(*) FROM {table} WHERE status = 'completed'")
        ).scalar() or 0
        processing = db.execute(
            text(
                f"SELECT COUNT(*) FROM {table} "
                f"WHERE status IN ('processing','pending','analyzing','scraping','generating','extracting')"
            )
        ).scalar() or 0
        failed = db.execute(
            text(f"SELECT COUNT(*) FROM {table} WHERE status = 'failed'")
        ).scalar() or 0
        return {"total": total, "completed": completed, "processing": processing, "failed": failed}
    except Exception:
        return {"total": 0, "completed": 0, "processing": 0, "failed": 0}


def _counts_creative(db: Session) -> dict:
    """creative_prompts has no status column — just count total."""
    try:
        total = db.execute(text("SELECT COUNT(*) FROM creative_prompts")).scalar() or 0
        return {"total": total, "completed": total, "processing": 0, "failed": 0}
    except Exception:
        return {"total": 0, "completed": 0, "processing": 0, "failed": 0}


def _recent_activity(db: Session) -> list[dict]:
    try:
        rows = db.execute(
            text(
                """
                SELECT type, id, title, status, created_at FROM (
                    SELECT 'video' as type, id, filename as title, status, created_at FROM videos
                    UNION ALL
                    SELECT 'product' as type, id, COALESCE(title, url) as title, status, created_at FROM products
                    UNION ALL
                    SELECT 'video_gen' as type, id, COALESCE(prompt, '视频生成') as title, status, created_at FROM video_generations
                )
                ORDER BY created_at DESC
                LIMIT 10
                """
            )
        ).fetchall()

        # Load reports for videos to compute display titles
        video_ids = [r.id for r in rows if r.type == 'video']
        reports_map = {}
        if video_ids:
            from app.models.report import Report
            from app.models.video import Video as VideoModel
            reports = db.query(Report).filter(Report.video_id.in_(video_ids)).all()
            for rep in reports:
                reports_map[rep.video_id] = rep

        results = []
        for r in rows:
            created = r.created_at
            if isinstance(created, datetime):
                created = created.isoformat()
            title = r.title or ""
            # For videos, compute display_title from report if available
            if r.type == 'video' and r.id in reports_map:
                from app.api.reports import _build_replica_display_title
                title = _build_replica_display_title(None, reports_map[r.id])
            results.append({
                "type": r.type,
                "id": r.id,
                "title": title,
                "status": r.status or "",
                "created_at": created or "",
            })
        return results
    except Exception:
        return []
