"""
Quick API endpoint verification script
"""
import requests
import json

BASE_URL = "http://localhost:8000"

def test_api_endpoints():
    print("Testing Storyboard API Endpoints")
    print("=" * 60)

    # Get existing replication
    print("\n1. Testing GET /api/storyboard/{id}")
    replication_id = "4186e198-2729-4d8b-ac04-e26dc5f8c8d2"

    try:
        response = requests.get(f"{BASE_URL}/api/storyboard/{replication_id}")
        if response.status_code == 200:
            data = response.json()
            print(f"✓ Status: {data['status']}")
            print(f"  Frame count: {data['frame_count']}")
            print(f"  Layout: {data['layout_grid']}")
        else:
            print(f"✗ Failed: {response.status_code}")
    except Exception as e:
        print(f"✗ Error: {e}")
        print("  (Server might not be running)")

    print("\n" + "=" * 60)

if __name__ == "__main__":
    test_api_endpoints()
