import pytest
from app.services.scraper import ScraperService


def test_scraper_initialization():
    scraper = ScraperService(products_dir="test_products")
    assert scraper.products_dir == "test_products"
    assert "User-Agent" in scraper.headers


def test_is_valid_image_url():
    scraper = ScraperService()
    assert scraper._is_valid_image_url("https://example.com/image.jpg")
    assert scraper._is_valid_image_url("https://example.com/photo.png")
    assert scraper._is_valid_image_url("https://example.com/pic.webp")
    assert scraper._is_valid_image_url("https://example.com/anim.gif")
    assert not scraper._is_valid_image_url("https://example.com/page.html")
    assert not scraper._is_valid_image_url("https://example.com/style.css")


def test_extract_title_og():
    from bs4 import BeautifulSoup

    html = '<html><head><meta property="og:title" content="Test Product"></head></html>'
    soup = BeautifulSoup(html, "html.parser")
    scraper = ScraperService()
    assert scraper._extract_title(soup) == "Test Product"


def test_extract_title_h1_fallback():
    from bs4 import BeautifulSoup

    html = "<html><body><h1>My Product</h1></body></html>"
    soup = BeautifulSoup(html, "html.parser")
    scraper = ScraperService()
    assert scraper._extract_title(soup) == "My Product"


def test_extract_title_default():
    from bs4 import BeautifulSoup

    html = "<html><body><div>No title here</div></body></html>"
    soup = BeautifulSoup(html, "html.parser")
    scraper = ScraperService()
    assert scraper._extract_title(soup) == "Untitled Product"


def test_extract_description():
    from bs4 import BeautifulSoup

    html = '<html><head><meta property="og:description" content="A great product"></head></html>'
    soup = BeautifulSoup(html, "html.parser")
    scraper = ScraperService()
    assert scraper._extract_description(soup) == "A great product"


def test_extract_description_fallback_paragraph():
    from bs4 import BeautifulSoup

    html = "<html><body><p>First paragraph text</p></body></html>"
    soup = BeautifulSoup(html, "html.parser")
    scraper = ScraperService()
    assert scraper._extract_description(soup) == "First paragraph text"


def test_extract_images():
    from bs4 import BeautifulSoup

    html = """
    <html>
    <head><meta property="og:image" content="https://example.com/og.jpg"></head>
    <body>
        <img src="/photo.png">
        <img data-src="/lazy.jpg">
        <img src="/script.js">
    </body>
    </html>
    """
    soup = BeautifulSoup(html, "html.parser")
    scraper = ScraperService()
    images = scraper._extract_images(soup, "https://example.com")
    assert "https://example.com/og.jpg" in images
    assert "https://example.com/photo.png" in images
    assert "https://example.com/lazy.jpg" in images
