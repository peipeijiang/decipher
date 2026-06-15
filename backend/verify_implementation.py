"""Verify Phase 1 implementation completeness"""
import sys
from pathlib import Path

def check_file_exists(path: str, description: str) -> bool:
    if Path(path).exists():
        print(f"✓ {description}")
        return True
    else:
        print(f"✗ {description} - MISSING")
        return False

def main():
    print("=" * 70)
    print("Phase 1 Implementation Verification")
    print("=" * 70)
    
    checks = [
        ("app/models/storyboard_replication.py", "Database model"),
        ("app/api/storyboard.py", "API endpoints"),
        ("app/services/storyboard_service.py", "Storyboard service"),
        ("app/utils/scene_detector.py", "Scene detector"),
        ("app/tasks/storyboard_pipeline.py", "Pipeline task"),
        ("migrations/add_storyboard_replications.py", "Migration script"),
        ("test_storyboard.py", "Test script"),
        ("README_STORYBOARD_PHASE1.md", "Documentation"),
    ]
    
    results = []
    for path, desc in checks:
        results.append(check_file_exists(path, desc))
    
    print("\n" + "=" * 70)
    print("Database Verification")
    print("=" * 70)
    
    try:
        import sqlite3
        conn = sqlite3.connect("tiktok_analyzer.db")
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='storyboard_replications'")
        if cursor.fetchone():
            print("✓ Table 'storyboard_replications' exists")
            results.append(True)
        else:
            print("✗ Table 'storyboard_replications' does not exist")
            results.append(False)
        conn.close()
    except Exception as e:
        print(f"✗ Database check failed: {e}")
        results.append(False)
    
    print("\n" + "=" * 70)
    print("Import Verification")
    print("=" * 70)
    
    try:
        from app.models.storyboard_replication import StoryboardReplication
        print("✓ StoryboardReplication model imports")
        results.append(True)
    except Exception as e:
        print(f"✗ StoryboardReplication import failed: {e}")
        results.append(False)
    
    try:
        from app.api.storyboard import router
        print("✓ Storyboard router imports")
        results.append(True)
    except Exception as e:
        print(f"✗ Storyboard router import failed: {e}")
        results.append(False)
    
    try:
        from app.utils.scene_detector import smart_extract_keyframes
        print("✓ Scene detector imports")
        results.append(True)
    except Exception as e:
        print(f"✗ Scene detector import failed: {e}")
        results.append(False)
    
    try:
        from app.services.storyboard_service import stitch_storyboard
        print("✓ Storyboard service imports")
        results.append(True)
    except Exception as e:
        print(f"✗ Storyboard service import failed: {e}")
        results.append(False)
    
    print("\n" + "=" * 70)
    if all(results):
        print("✓✓✓ ALL CHECKS PASSED - Phase 1 Implementation Complete!")
    else:
        print(f"✗✗✗ {len([r for r in results if not r])} checks failed")
    print("=" * 70)
    
    return all(results)

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
