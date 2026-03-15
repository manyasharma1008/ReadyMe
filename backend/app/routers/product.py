"""
Product Router - API endpoints for extracting size charts from product pages
"""

import re
import os
from typing import Optional
from urllib.parse import urlparse
from fastapi import APIRouter, HTTPException
from app.models.schemas import (
    ProductExtractRequest,
    ProductExtractResponse,
    ProductInfo,
    SizeChart,
    SizeChartEntry
)

router = APIRouter()

# Try to import BeautifulSoup, with graceful fallback
try:
    from bs4 import BeautifulSoup
    BEAUTIFULSOUP_AVAILABLE = True
except ImportError:
    BEAUTIFULSOUP_AVAILABLE = False

# Try to import requests, with graceful fallback
try:
    import requests
    REQUESTS_AVAILABLE = True
except ImportError:
    REQUESTS_AVAILABLE = False


# Common size patterns in various formats
SIZE_PATTERNS = {
    "alpha": ["XS", "S", "M", "L", "XL", "XXL", "XXXL"],
    "numeric": [str(i) for i in range(24, 46)],  # 24-45
    "eu": [str(i) for i in range(32, 58)],  # EU sizes
    "uk": [str(i) for i in range(6, 20)],  # UK sizes
    "us": [str(i) for i in range(0, 20)],  # US sizes
}


def detect_platform(url: str) -> str:
    """Detect the e-commerce platform from URL."""
    url_lower = url.lower()

    if "amazon." in url_lower:
        return "amazon"
    elif "myntra.com" in url_lower:
        return "myntra"
    elif "flipkart.com" in url_lower:
        return "flipkart"
    elif "meesho.com" in url_lower:
        return "meesho"
    elif "ajio.com" in url_lower:
        return "ajio"
    else:
        return "generic"


def extract_brand_from_url(url: str) -> Optional[str]:
    """Extract brand name from URL path."""
    try:
        parsed = urlparse(url)
        path_parts = parsed.path.strip("/").split("/")

        # Usually brand is the first or second path segment
        for part in path_parts[:3]:
            if part and not part.startswith("dp") and not part.startswith("p-"):
                # Clean up and capitalize
                brand = part.replace("-", " ").replace("_", " ")
                if len(brand) > 2 and len(brand) < 30:
                    return brand.title()
    except Exception:
        pass

    return None


def detect_category_from_url(url: str, html: str = "") -> str:
    """Detect garment category from URL or page content."""
    url_lower = url.lower()

    # URL-based detection
    category_keywords = {
        "shirts": ["shirt", "tshirt", "t-shirt", "polo", "blouse"],
        "pants": ["pant", "jean", "trouser", "shorts", "legging"],
        "dresses": ["dress", "gown", "saree", "kurti"],
        "jackets": ["jacket", "coat", "blazer", "hoodie", "sweater"],
        "shoes": ["shoe", "sneaker", "boot", "sandal", "heel"],
    }

    for category, keywords in category_keywords.items():
        if any(kw in url_lower for kw in keywords):
            return category

    # HTML-based detection (check page title and meta tags)
    if html:
        html_lower = html.lower()
        for category, keywords in category_keywords.items():
            if any(kw in html_lower for kw in keywords):
                return category

    return "shirts"  # Default category


def detect_gender_from_url(url: str, html: str = "") -> Optional[str]:
    """Detect target gender from URL or page content."""
    url_lower = url.lower()
    html_lower = html.lower() if html else ""

    # Check for gender indicators in URL
    if any(x in url_lower for x in ["men", "male", "mens", "boy"]):
        return "men"
    elif any(x in url_lower for x in ["women", "female", "womens", "girl"]):
        return "women"
    elif any(x in url_lower for x in ["kid", "child", "baby"]):
        return "kids"

    # Check in HTML content
    if html_lower:
        if "men" in html_lower[:5000] or "men's" in html_lower[:5000]:
            return "men"
        elif "women" in html_lower[:5000] or "women's" in html_lower[:5000]:
            return "women"

    return None


def parse_size_table_generic(table_html: str) -> list[dict]:
    """Parse a generic HTML size table."""
    if not BEAUTIFULSOUP_AVAILABLE:
        return []

    sizes = []
    try:
        soup = BeautifulSoup(table_html, "html.parser")

        # Find all rows
        rows = soup.find_all("tr")

        for row in rows:
            cells = row.find_all(["td", "th"])
            if len(cells) < 2:
                continue

            # First cell is usually the size label
            size_label = cells[0].get_text(strip=True).upper()

            # Check if it's a valid size
            is_valid_size = False
            for size_type, patterns in SIZE_PATTERNS.items():
                if size_label in patterns or size_label.replace(" ", "") in patterns:
                    is_valid_size = True
                    break

            if is_valid_size:
                size_entry = {"size": size_label}

                # Try to extract measurements from other cells
                for i, cell in enumerate(cells[1:], 1):
                    cell_text = cell.get_text(strip=True).lower()

                    # Look for measurement patterns (e.g., "32-34", "32-36 inches")
                    range_match = re.findall(r"(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)", cell_text)
                    if range_match:
                        size_entry[f"min_{i}"] = float(range_match[0][0])
                        size_entry[f"max_{i}"] = float(range_match[0][1])

                    # Look for single values
                    single_match = re.findall(r"(\d+(?:\.\d+)?)\s*(?:cm|inch|inches)?", cell_text)
                    if single_match and f"min_{i}" not in size_entry:
                        size_entry[f"value_{i}"] = float(single_match[0])

                sizes.append(size_entry)

    except Exception as e:
        print(f"Error parsing table: {e}")

    return sizes


def extract_size_chart_amazon(html: str) -> Optional[SizeChart]:
    """Extract size chart from Amazon product page."""
    if not BEAUTIFULSOUP_AVAILABLE:
        return None

    try:
        soup = BeautifulSoup(html, "html.parser")

        # Try to find size chart in various Amazon formats
        size_data = {}

        # Method 1: Look for size chart in table format
        tables = soup.find_all("table")
        for table in tables:
            table_text = table.get_text().lower()
            if "size" in table_text and ("chest" in table_text or "waist" in table_text or "length" in table_text):
                rows = table.find_all("tr")
                headers = None

                for row in rows:
                    cells = [c.get_text(strip=True) for c in row.find_all(["td", "th"])]
                    if not headers:
                        headers = [c.lower() for c in cells]
                        continue

                    if len(cells) < 2:
                        continue

                    size_label = cells[0].upper()
                    size_data[size_label] = {}

                    for i, header in enumerate(headers[1:], 1):
                        if i < len(cells):
                            value = cells[i]
                            # Parse range values
                            range_match = re.findall(r"(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)", value)
                            if range_match:
                                size_data[size_label][f"{header}_min"] = float(range_match[0][0])
                                size_data[size_label][f"{header}_max"] = float(range_match[0][1])
                            else:
                                try:
                                    size_data[size_label][header] = float(value)
                                except ValueError:
                                    pass

        # Convert to SizeChart format
        if size_data:
            sizes = []
            for size, measurements in size_data.items():
                entry = SizeChartEntry(size=size)

                # Map common measurement names
                for key, value in measurements.items():
                    if "chest" in key:
                        if "_min" in key:
                            entry.chest_min = value
                        elif "_max" in key:
                            entry.chest_max = value
                    elif "waist" in key:
                        if "_min" in key:
                            entry.waist_min = value
                        elif "_max" in key:
                            entry.waist_max = value
                    elif "hip" in key:
                        if "_min" in key:
                            entry.hips_min = value
                        elif "_max" in key:
                            entry.hips_max = value
                    elif "length" in key or "height" in key:
                        if "_min" in key:
                            entry.height_min = value
                        elif "_max" in key:
                            entry.height_max = value
                    elif "shoulder" in key:
                        if "_min" in key:
                            entry.shoulder_min = value
                        elif "_max" in key:
                            entry.shoulder_max = value

                sizes.append(entry)

            return SizeChart(
                brand="Amazon Seller",
                category="shirts",
                sizes=sizes,
                gender=None
            )

    except Exception as e:
        print(f"Error extracting Amazon size chart: {e}")

    return None


def extract_size_chart_myntra(html: str) -> SizeChart:
    """Extract size chart from Myntra product page."""
    if not BEAUTIFULSOUP_AVAILABLE:
        return None

    try:
        soup = BeautifulSoup(html, "html.parser")

        # Myntra usually has size chart in a specific element
        size_chart_elements = soup.find_all(["table", "div"], class_=lambda x: x and "sizechart" in x.lower() if x else False)

        sizes = []

        for element in size_chart_elements:
            rows = element.find_all("tr")

            for row in rows:
                cells = row.find_all(["td", "th"])
                if len(cells) < 2:
                    continue

                size_label = cells[0].get_text(strip=True).upper()

                # Check for valid size
                is_valid = False
                for size_type, patterns in SIZE_PATTERNS.items():
                    if size_label in patterns:
                        is_valid = True
                        break

                if is_valid:
                    entry = SizeChartEntry(size=size_label)

                    # Try to extract measurements
                    for i, cell in enumerate(cells[1:], 1):
                        text = cell.get_text(strip=True)
                        range_match = re.findall(r"(\d+(?:\.\d+)?)", text)
                        if len(range_match) >= 2:
                            if i == 1:
                                entry.chest_min = float(range_match[0])
                                entry.chest_max = float(range_match[1])
                            elif i == 2:
                                entry.waist_min = float(range_match[0])
                                entry.waist_max = float(range_match[1])
                            elif i == 3:
                                entry.hips_min = float(range_match[0])
                                entry.hips_max = float(range_match[1])
                        elif len(range_match) == 1:
                            if i == 1:
                                entry.height_min = float(range_match[0])
                                entry.height_max = float(range_match[0]) + 5

                    sizes.append(entry)

        if sizes:
            return SizeChart(
                brand="Myntra Seller",
                category="shirts",
                sizes=sizes,
                gender=None
            )

    except Exception as e:
        print(f"Error extracting Myntra size chart: {e}")

    return None


def extract_size_chart_flipkart(html: str) -> SizeChart:
    """Extract size chart from Flipkart product page."""
    if not BEAUTIFULSOUP_AVAILABLE:
        return None

    try:
        soup = BeautifulSoup(html, "html.parser")

        # Flipkart size chart is often in a modal or specific div
        size_charts = soup.find_all(["table", "div"], attrs={"data-testid": "size-chart"})

        sizes = []

        for chart in size_charts:
            rows = chart.find_all("tr")

            for row in rows:
                cells = row.find_all(["td", "th"])
                if len(cells) < 2:
                    continue

                size_label = cells[0].get_text(strip=True).upper()

                # Check for valid size
                is_valid = False
                for size_type, patterns in SIZE_PATTERNS.items():
                    if size_label in patterns:
                        is_valid = True
                        break

                if is_valid:
                    entry = SizeChartEntry(size=size_label)

                    # Extract measurements
                    for i, cell in enumerate(cells[1:], 1):
                        text = cell.get_text(strip=True)
                        numbers = re.findall(r"(\d+(?:\.\d+)?)", text)
                        if numbers:
                            if i == 1:
                                entry.chest_min = float(numbers[0])
                                entry.chest_max = float(numbers[-1]) if len(numbers) > 1 else float(numbers[0]) + 5
                            elif i == 2:
                                entry.waist_min = float(numbers[0])
                                entry.waist_max = float(numbers[-1]) if len(numbers) > 1 else float(numbers[0]) + 5
                            elif i == 3:
                                entry.height_min = float(numbers[0])
                                entry.height_max = float(numbers[-1]) if len(numbers) > 1 else float(numbers[0]) + 5

                    sizes.append(entry)

        if sizes:
            return SizeChart(
                brand="Flipkart Seller",
                category="shirts",
                sizes=sizes,
                gender=None
            )

    except Exception as e:
        print(f"Error extracting Flipkart size chart: {e}")

    return None


def create_fallback_size_chart(category: str, gender: str = "men") -> SizeChart:
    """Create a basic size chart when extraction fails."""
    # Use standard chart as fallback
    from app.services.chart_matcher import get_standard_chart
    return get_standard_chart(category, gender)


@router.post("/extract", response_model=ProductExtractResponse)
async def extract_product_size_chart(request: ProductExtractRequest):
    """
    Extract size chart from a product URL.

    - **url**: Product page URL (Amazon, Myntra, Flipkart)
    - **category**: Expected garment category (optional)
    """
    warnings = []

    # Check dependencies
    if not BEAUTIFULSOUP_AVAILABLE:
        return ProductExtractResponse(
            success=False,
            product=None,
            size_chart=None,
            message=" BeautifulSoup not installed. Cannot extract size charts.",
            warnings=["Install beautifulsoup4: pip install beautifulsoup4"]
        )

    if not REQUESTS_AVAILABLE:
        return ProductExtractResponse(
            success=False,
            product=None,
            size_chart=None,
            message="requests not installed. Cannot fetch product pages.",
            warnings=["Install requests: pip install requests"]
        )

    try:
        # Fetch the product page
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
        }

        response = requests.get(request.url, headers=headers, timeout=10)
        response.raise_for_status()
        html = response.text

        # Detect platform and extract data
        platform = detect_platform(request.url)

        # Extract product information
        brand = extract_brand_from_url(request.url)
        category = request.category or detect_category_from_url(request.url, html)
        gender = detect_gender_from_url(request.url, html)

        # Extract product name from HTML
        product_name = "Unknown Product"
        try:
            soup = BeautifulSoup(html, "html.parser")

            # Try different selectors for different platforms
            title = (
                soup.find("span", attrs={"data-a-color": "price"}) or
                soup.find("h1", attrs={"data-testid": "pdp-product-title"}) or
                soup.find("title") or
                soup.find("h1")
            )
            if title:
                product_name = title.get_text(strip=True)[:100]
        except Exception:
            pass

        # Extract size chart based on platform
        size_chart = None

        if platform == "amazon":
            size_chart = extract_size_chart_amazon(html)
        elif platform == "myntra":
            size_chart = extract_size_chart_myntra(html)
        elif platform == "flipkart":
            size_chart = extract_size_chart_flipkart(html)
        else:
            # Try generic extraction
            size_chart = extract_size_chart_myntra(html)  # Try Myntra format as fallback

        # Use fallback if no chart found
        if not size_chart or not size_chart.sizes:
            size_chart = create_fallback_size_chart(category, gender or "men")
            warnings.append(f"Could not extract size chart from {platform}. Using standard {gender or 'men'} {category} chart.")

        # Update chart with detected info
        if size_chart:
            size_chart.brand = brand or size_chart.brand
            size_chart.category = category
            size_chart.gender = gender

        product_info = ProductInfo(
            name=product_name,
            brand=brand,
            category=category,
            gender=gender,
            url=request.url
        )

        return ProductExtractResponse(
            success=True,
            product=product_info,
            size_chart=size_chart,
            message=f"Size chart extracted from {platform}",
            warnings=warnings if warnings else None
        )

    except requests.exceptions.Timeout:
        return ProductExtractResponse(
            success=False,
            product=None,
            size_chart=None,
            message="Request timed out. Could not fetch product page.",
            warnings=["Try again with a different URL or increase timeout"]
        )

    except requests.exceptions.RequestException as e:
        return ProductExtractResponse(
            success=False,
            product=None,
            size_chart=None,
            message=f"Failed to fetch product page: {str(e)}",
            warnings=["Check URL and try again"]
        )

    except Exception as e:
        return ProductExtractResponse(
            success=False,
            product=None,
            size_chart=None,
            message=f"Extraction error: {str(e)}",
            warnings=["Contact support if this persists"]
        )


@router.get("/supported-platforms")
async def get_supported_platforms():
    """Get list of supported e-commerce platforms."""
    return {
        "platforms": [
            {"name": "Amazon", "domain": "amazon.in, amazon.com"},
            {"name": "Myntra", "domain": "myntra.com"},
            {"name": "Flipkart", "domain": "flipkart.com"},
            {"name": "Meesho", "domain": "meesho.com"},
            {"name": "Ajio", "domain": "ajio.com"}
        ],
        "note": "Generic parsing works on most e-commerce sites"
    }