"""
Test script for storyboard replication functionality

Usage:
    python test_storyboard.py
"""
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent))

from app.database import SessionLocal
from app.models.video import Video
from app.models.storyboard_replication import StoryboardReplication
from app.tasks.storyboard_pipeline import extract_keyframes_pipeline


def test_storyboard_creation():
    """Test creating a storyboard replication task."""
    db = SessionLocal()

    try:
        # Find first video in database
        video = db.query(Video).first()

        if not video:
            print("❌ No videos found in database")
            print("   Please upload a video first using the web interface")
            return False

        print(f"✓ Found video: {video.filename}")
        print(f"  Video ID: {video.id}")
        print(f"  Duration: {video.duration}s")

        # Check if storyboard already exists
        existing = db.query(StoryboardReplication).filter(
            StoryboardReplication.video_id == video.id
        ).first()

        if existing:
            print(f"\n✓ Storyboard task already exists: {existing.id}")
            print(f"  Status: {existing.status}")
            print(f"  Frame count: {existing.frame_count}")
            print(f"  Layout: {existing.layout_grid}")

            if existing.storyboard_image_path:
                print(f"  Image: {existing.storyboard_image_path}")
                if Path(existing.storyboard_image_path).exists():
                    print("  ✓ Image file exists")
                else:
                    print("  ❌ Image file not found")

            return True

        # Create new task
        print("\n Creating storyboard task...")
        replication = StoryboardReplication(
            video_id=video.id,
            status="pending"
        )
        db.add(replication)
        db.commit()
        db.refresh(replication)

        print(f"✓ Task created: {replication.id}")
        print(f"  Status: {replication.status}")

        # Run pipeline synchronously for testing
        print("\n Running keyframe extraction pipeline...")
        extract_keyframes_pipeline(replication.id)

        # Refresh to get updated status
        db.refresh(replication)

        print(f"\n✓ Pipeline completed")
        print(f"  Status: {replication.status}")
        print(f"  Frame count: {replication.frame_count}")
        print(f"  Layout: {replication.layout_grid}")

        if replication.error:
            print(f"  ❌ Error: {replication.error}")
            return False

        if replication.storyboard_image_path:
            print(f"  Image: {replication.storyboard_image_path}")
            if Path(replication.storyboard_image_path).exists():
                size = Path(replication.storyboard_image_path).stat().st_size
                print(f"  ✓ Image file exists ({size // 1024} KB)")
            else:
                print("  ❌ Image file not found")
                return False

        return replication.status == "ready"

    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

    finally:
        db.close()


if __name__ == "__main__":
    print("=" * 60)
    print("Testing Storyboard Replication Functionality")
    print("=" * 60)

    success = test_storyboard_creation()

    print("\n" + "=" * 60)
    if success:
        print("✓ All tests passed!")
    else:
        print("❌ Tests failed")
    print("=" * 60)

    sys.exit(0 if success else 1)

