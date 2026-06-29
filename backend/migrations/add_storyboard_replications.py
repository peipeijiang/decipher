"""
Migration: Add storyboard_replications table
Date: 2026-06-04

Run this migration with:
    python migrations/add_storyboard_replications.py
"""
from sqlalchemy import create_engine, text

SQLITE_URL = "sqlite:///./tiktok_analyzer.db"


def upgrade():
    engine = create_engine(SQLITE_URL)
    with engine.connect() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS storyboard_replications (
                id TEXT PRIMARY KEY,
                video_id TEXT NOT NULL,
                frame_count INTEGER,
                frame_timestamps TEXT,
                frame_paths TEXT,
                storyboard_image_path TEXT,
                layout_grid TEXT,
                product_image_path TEXT,
                product_description TEXT,
                replaced_storyboard_path TEXT,
                original_prompt TEXT,
                compressed_prompt TEXT,
                original_duration REAL,
                compressed_duration REAL DEFAULT 15.0,
                status TEXT DEFAULT 'pending',
                error TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (video_id) REFERENCES videos(id)
            )
        """))
        conn.commit()
        print("✓ Table 'storyboard_replications' created successfully")


def downgrade():
    engine = create_engine(SQLITE_URL)
    with engine.connect() as conn:
        conn.execute(text("DROP TABLE IF EXISTS storyboard_replications"))
        conn.commit()
        print("✓ Table 'storyboard_replications' dropped successfully")
