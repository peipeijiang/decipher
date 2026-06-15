import os

import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse


class ScraperService:
    def __init__(self, products_dir: str = "products"):
        self.products_dir = products_dir
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
        }

    def scrape_product_page(self, url: str, product_id: str) -> dict:
        """Scrape product page and download images."""
        try:
            response = requests.get(url, headers=self.headers, timeout=30)
            response.raise_for_status()
            soup = BeautifulSoup(response.content, "html.parser")

            title = self._extract_title(soup)
            description = self._extract_description(soup)
            images = self._extract_images(soup, url)

            product_dir = os.path.join(self.products_dir, product_id)
            images_dir = os.path.join(product_dir, "images")
            os.makedirs(images_dir, exist_ok=True)

            downloaded_images = []
            for idx, img_url in enumerate(images[:30]):
                try:
                    img_path = self._download_image(img_url, images_dir, idx)
                    if img_path:
                        downloaded_images.append({
                            "url": img_url,
                            "path": img_path,
                            "index": idx,
                        })
                except Exception as e:
                    print(f"Failed to download image {img_url}: {e}")

            return {
                "title": title,
                "description": description,
                "images": downloaded_images,
                "images_dir": images_dir,
            }

        except requests.RequestException as e:
            raise Exception(f"Scraping failed: {str(e)}")

    def _extract_title(self, soup: BeautifulSoup) -> str:
        """Extract page title using multiple selectors."""
        selectors = [
            ("meta", {"property": "og:title"}),
            ("meta", {"name": "twitter:title"}),
            ("h1", {}),
            ("title", {}),
        ]

        for tag, attrs in selectors:
            element = soup.find(tag, attrs)
            if element:
                if tag == "meta":
                    return element.get("content", "").strip()
                return element.get_text().strip()

        return "Untitled Product"

    def _extract_description(self, soup: BeautifulSoup) -> str:
        """Extract page description using multiple selectors."""
        selectors = [
            ("meta", {"property": "og:description"}),
            ("meta", {"name": "description"}),
            ("meta", {"name": "twitter:description"}),
        ]

        for tag, attrs in selectors:
            element = soup.find(tag, attrs)
            if element:
                return element.get("content", "").strip()

        p = soup.find("p")
        if p:
            return p.get_text().strip()

        return ""

    def _extract_images(self, soup: BeautifulSoup, base_url: str) -> list[str]:
        """Extract all product images."""
        images = []

        og_image = soup.find("meta", {"property": "og:image"})
        if og_image and og_image.get("content"):
            images.append(urljoin(base_url, og_image["content"]))

        for img in soup.find_all("img"):
            src = img.get("src") or img.get("data-src")
            if src:
                full_url = urljoin(base_url, src)
                if self._is_valid_image_url(full_url) and full_url not in images:
                    images.append(full_url)

        return images

    def _is_valid_image_url(self, url: str) -> bool:
        """Check if URL is a valid image."""
        try:
            parsed = urlparse(url)
            path = parsed.path.lower()
            # Check common image extensions
            if any(path.endswith(ext) for ext in [".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"]):
                return True
            # Support CDN URLs without extensions (Shopify, etc.)
            if any(domain in parsed.netloc for domain in ["cdn.shopify.com", "shopifycdn", "cdninstagram", "cloudinary"]):
                return True
            # Check for image-related path patterns
            if any(seg in path for seg in ["/products/", "/images/", "/photos/", "/media/"]):
                return True
            return False
        except Exception:
            return False

    def _download_image(self, url: str, save_dir: str, index: int) -> str:
        """Download image and return local path."""
        try:
            response = requests.get(url, headers=self.headers, timeout=15)
            response.raise_for_status()

            ext = ".jpg"
            content_type = response.headers.get("content-type", "")
            if "png" in content_type:
                ext = ".png"
            elif "webp" in content_type:
                ext = ".webp"

            filename = f"image_{index}{ext}"
            filepath = os.path.join(save_dir, filename)

            with open(filepath, "wb") as f:
                f.write(response.content)

            return filepath

        except requests.RequestException as e:
            raise Exception(f"Download failed: {str(e)}")
