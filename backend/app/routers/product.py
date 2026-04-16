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
    ProductChartIngestRequest,
    ProductChartIngestResponse,
    ProductInfo,
    SizeChart,
    SizeChartEntry
)
from app.services import chart_matcher

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

MEASUREMENT_ALIASES = {
    "chest": "chest",
    "bust": "chest",
    "across chest": "chest",
    "waist": "waist",
    "hips": "hips",
    "hip": "hips",
    "seat": "hips",
    "length": "height",
    "body length": "height",
    "height": "height",
    "outseam": "height",
    "inseam": "height",
    "shoulder": "shoulder_width",
    "shoulders": "shoulder_width",
    "shoulder width": "shoulder_width",
}


def looks_like_size_label(value: str) -> bool:
    """Return True when the text looks like a real apparel size label."""
    text = (value or "").strip().upper()
    if not text:
        return False

    for patterns in SIZE_PATTERNS.values():
        if text in patterns or text.replace(" ", "") in patterns:
            return True

    return bool(re.fullmatch(r"(XXXS|XXS|XS|S|M|L|XL|XXL|XXXL|4XL|5XL|\d{1,3}|W\d{2,3})", text))


def looks_like_measurement_label(value: str) -> bool:
    """Return True when the text looks like a measurement axis label."""
    normalized = re.sub(r"[^a-z\s]", " ", (value or "").lower()).strip()
    normalized = re.sub(r"\s+", " ", normalized)
    if not normalized:
        return False

    return normalize_measurement_name(normalized) is not None


def parse_numeric_range(value: str) -> tuple[Optional[float], Optional[float]]:
    """Parse a measurement cell into min/max values."""
    text = (value or "").replace(",", " ").strip()
    if not text:
        return None, None

    range_match = re.search(r"(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)", text)
    if range_match:
        return float(range_match.group(1)), float(range_match.group(2))

    matches = re.findall(r"\d+(?:\.\d+)?", text)
    if not matches:
        return None, None

    numeric_value = float(matches[0])
    return numeric_value, numeric_value


def build_size_entry(size_label: str, measurements: dict[str, tuple[Optional[float], Optional[float]]]) -> SizeChartEntry:
    """Build a typed size chart entry from normalized measurements."""
    entry = SizeChartEntry(size=size_label)

    for measurement_name, (min_value, max_value) in measurements.items():
        if min_value is None and max_value is None:
            continue

        if measurement_name == "chest":
            entry.chest_min = min_value if min_value is not None else max_value
            entry.chest_max = max_value if max_value is not None else min_value
        elif measurement_name == "waist":
            entry.waist_min = min_value if min_value is not None else max_value
            entry.waist_max = max_value if max_value is not None else min_value
        elif measurement_name == "hips":
            entry.hips_min = min_value if min_value is not None else max_value
            entry.hips_max = max_value if max_value is not None else min_value
        elif measurement_name == "height":
            entry.height_min = min_value if min_value is not None else max_value
            entry.height_max = max_value if max_value is not None else min_value
        elif measurement_name == "shoulder_width":
            entry.shoulder_min = min_value if min_value is not None else max_value
            entry.shoulder_max = max_value if max_value is not None else min_value

    return entry


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
    """Parse a generic HTML size table in either row or column layout."""
    if not BEAUTIFULSOUP_AVAILABLE:
        return []

    try:
        soup = BeautifulSoup(table_html, "html.parser")
        tables = soup.find_all("table")
        all_rows: list[dict] = []

        for table in tables:
            rows = [
                [cell.get_text(" ", strip=True) for cell in row.find_all(["td", "th"])]
                for row in table.find_all("tr")
            ]
            rows = [row for row in rows if len(row) >= 2]
            if len(rows) < 2:
                continue

            row_oriented = _parse_rows_as_sizes(rows)
            column_oriented = _parse_columns_as_sizes(rows)
            best_rows = row_oriented if len(row_oriented) >= len(column_oriented) else column_oriented
            all_rows.extend(best_rows)

        deduped = []
        seen = set()
        for row in all_rows:
            key = tuple(sorted(row.items()))
            if key in seen:
                continue
            seen.add(key)
            deduped.append(row)

        return deduped
    except Exception as e:
        print(f"Error parsing table: {e}")
        return []


def _parse_rows_as_sizes(rows: list[list[str]]) -> list[dict]:
    """Parse tables where each row is one size and columns are measurements."""
    header_row = rows[0]
    size_index = next((index for index, cell in enumerate(header_row) if looks_like_size_label(cell)), 0)
    measurement_headers = [
        (index, normalize_measurement_name(cell))
        for index, cell in enumerate(header_row)
        if index != size_index and normalize_measurement_name(cell)
    ]

    if not measurement_headers:
        return []

    parsed_rows = []
    for row in rows[1:]:
        if len(row) <= size_index:
            continue

        size_label = row[size_index].strip().upper()
        if not looks_like_size_label(size_label):
            continue

        measurements: dict[str, tuple[Optional[float], Optional[float]]] = {}
        for column_index, measurement_name in measurement_headers:
            if column_index >= len(row):
                continue
            min_value, max_value = parse_numeric_range(row[column_index])
            if measurement_name and (min_value is not None or max_value is not None):
                measurements[measurement_name] = (min_value, max_value)

        if measurements:
            entry = build_size_entry(size_label, measurements)
            parsed_rows.append(entry.dict())

    return parsed_rows


def _parse_columns_as_sizes(rows: list[list[str]]) -> list[dict]:
    """Parse tables where sizes are across the top row and measurements are rows."""
    header_row = rows[0]
    size_columns = [
        (index, cell.strip().upper())
        for index, cell in enumerate(header_row[1:], 1)
        if looks_like_size_label(cell)
    ]

    if not size_columns:
        return []

    measurement_rows = []
    for row in rows[1:]:
        if not row:
            continue
        measurement_name = normalize_measurement_name(row[0])
        if not measurement_name:
            continue
        measurement_rows.append((measurement_name, row))

    if not measurement_rows:
        return []

    parsed_entries: dict[str, dict[str, tuple[Optional[float], Optional[float]]]] = {
        size_label: {} for _, size_label in size_columns
    }

    for measurement_name, row in measurement_rows:
        for column_index, size_label in size_columns:
            if column_index >= len(row):
                continue
            min_value, max_value = parse_numeric_range(row[column_index])
            if min_value is None and max_value is None:
                continue
            parsed_entries[size_label][measurement_name] = (min_value, max_value)

    parsed_rows = []
    for size_label, measurements in parsed_entries.items():
        if measurements:
            entry = build_size_entry(size_label, measurements)
            parsed_rows.append(entry.dict())

    return parsed_rows


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


def extract_size_chart_from_text(text: str, category: str, gender: Optional[str]) -> Optional[SizeChart]:
    """Extract size chart data from loose page text."""
    normalized_text = re.sub(r"\s+", "\n", text or "")
    lines = [line.strip() for line in normalized_text.splitlines() if line.strip()]

    if len(lines) < 3:
        return None

    size_labels = re.compile(r"\b(XXXS|XXS|XS|S|M|L|XL|XXL|XXXL|4XL|5XL|\d{2,3})\b", re.I)
    measurement_hints = list(MEASUREMENT_ALIASES.keys())
    extracted_entries: list[SizeChartEntry] = []

    for line in lines[:120]:
        lowered = line.lower()
        if not size_labels.search(line):
            continue
        if not any(hint in lowered for hint in measurement_hints):
            continue

        measurements: dict[str, tuple[Optional[float], Optional[float]]] = {}
        labels = size_labels.findall(line)
        for hint in measurement_hints:
            index = lowered.find(hint)
            if index < 0:
                continue
            min_value, max_value = parse_numeric_range(line[index:index + 90])
            if min_value is not None or max_value is not None:
                measurements[normalize_measurement_name(hint)] = (min_value, max_value)

        for label in labels:
            if measurements:
                extracted_entries.append(build_size_entry(label.upper(), measurements))

    deduped: list[SizeChartEntry] = []
    seen = set()
    for entry in extracted_entries:
        key = entry.size + str(entry.dict())
        if key in seen:
            continue
        seen.add(key)
        deduped.append(entry)

    if len(deduped) < 2:
        return None

    return SizeChart(
        brand="Generic Web",
        category=category,
        sizes=deduped[:12],
        gender=gender
    )


def extract_size_chart_generic(html: str, category: str, gender: Optional[str]) -> Optional[SizeChart]:
    """Try multiple generic extraction strategies for any product page."""
    if not BEAUTIFULSOUP_AVAILABLE:
        return None

    try:
        soup = BeautifulSoup(html, "html.parser")
        table_selectors = [
            "table",
            '[role="dialog"] table',
            ".modal table",
            ".popup table",
            ".drawer table",
            ".sheet table",
            '[class*="size"] table',
            '[id*="size"] table',
            '[data-testid*="size"] table',
        ]

        table_candidates = []
        for selector in table_selectors:
            for table in soup.select(selector)[:10]:
                parsed_rows = parse_size_table_generic(str(table))
                if parsed_rows:
                    table_candidates.append(parsed_rows)

        if not table_candidates:
            for table in soup.find_all("table")[:20]:
                parsed_rows = parse_size_table_generic(str(table))
                if parsed_rows:
                    table_candidates.append(parsed_rows)

        if table_candidates:
            best_rows = max(table_candidates, key=len)
            size_entries = [SizeChartEntry(**row) for row in best_rows if row.get("size")]
            if len(size_entries) >= 2:
                return SizeChart(
                    brand="Generic Web",
                    category=category,
                    sizes=size_entries,
                    gender=gender
                )

        text_chart = extract_size_chart_from_text(soup.get_text("\n", strip=True), category, gender)
        if text_chart:
            return text_chart

    except Exception as e:
        print(f"Error extracting generic size chart: {e}")

    return None


def create_fallback_size_chart(category: str, gender: str = "men") -> SizeChart:
    """Create a basic size chart when extraction fails."""
    # Use standard chart as fallback
    from app.services.chart_matcher import get_standard_chart
    return get_standard_chart(category, gender)


def normalize_unit(unit: Optional[str]) -> str:
    """Normalize units from extension payloads."""
    raw = (unit or "cm").strip().lower()
    if raw in {"in", "inch", "inches", '"'}:
        return "inches"
    return "cm"


def to_cm(value: float, unit: str) -> float:
    """Convert inches to cm when needed."""
    numeric = float(value)
    if unit == "inches":
        return round(numeric * 2.54, 2)
    return round(numeric, 2)


def normalize_measurement_name(name: str) -> Optional[str]:
    """Map extractor measurement labels to backend chart keys."""
    normalized = re.sub(r"[^a-z\s]", " ", name.lower()).strip()
    normalized = re.sub(r"\s+", " ", normalized)

    if normalized in MEASUREMENT_ALIASES:
        return MEASUREMENT_ALIASES[normalized]

    for alias, canonical in MEASUREMENT_ALIASES.items():
        if alias in normalized:
            return canonical

    return None


def build_size_chart_from_extension(request: ProductChartIngestRequest) -> tuple[SizeChart, list[str]]:
    """Normalize extension DOM extraction payload into backend size chart schema."""
    warnings = list(request.size_chart.warnings or [])
    unit = normalize_unit(request.size_chart.unit)
    category = request.product.category or "shirts"
    gender = request.product.gender
    brand = request.product.brand or extract_brand_from_url(request.product.url) or "Unknown Brand"

    normalized_sizes = []

    for row in request.size_chart.sizes:
        entry_payload = {"size": row.label.strip()}
        normalized_count = 0

        for raw_name, raw_value in row.measurements.items():
            if raw_value is None:
                continue

            canonical_name = normalize_measurement_name(raw_name)
            if not canonical_name:
                warnings.append(f"Ignored unsupported measurement column '{raw_name}'")
                continue

            measurement_value = to_cm(raw_value, unit)

            if canonical_name == "height":
                entry_payload["height_min"] = measurement_value
                entry_payload["height_max"] = measurement_value
            elif canonical_name == "chest":
                entry_payload["chest_min"] = measurement_value
                entry_payload["chest_max"] = measurement_value
            elif canonical_name == "waist":
                entry_payload["waist_min"] = measurement_value
                entry_payload["waist_max"] = measurement_value
            elif canonical_name == "hips":
                entry_payload["hips_min"] = measurement_value
                entry_payload["hips_max"] = measurement_value
            elif canonical_name == "shoulder_width":
                entry_payload["shoulder_min"] = measurement_value
                entry_payload["shoulder_max"] = measurement_value

            normalized_count += 1

        if normalized_count == 0:
            warnings.append(f"Skipped size '{row.label}' because it had no supported numeric measurements")
            continue

        normalized_sizes.append(SizeChartEntry(**entry_payload))

    if not normalized_sizes:
        raise ValueError("No usable size rows were found in the extracted size chart")

    return (
        SizeChart(
            brand=brand,
            category=category,
            sizes=normalized_sizes,
            gender=gender
        ),
        warnings
    )


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
            size_chart = None

        if not size_chart or not size_chart.sizes:
            size_chart = extract_size_chart_generic(html, category, gender)

        # Use fallback only when explicitly allowed
        if not size_chart or not size_chart.sizes:
            warnings.append(f"Could not extract a real size chart from {platform}.")
            if request.use_standard_chart:
                size_chart = create_fallback_size_chart(category, gender or "men")
                warnings.append(f"Using standard {gender or 'men'} {category} chart as fallback.")
            else:
                return ProductExtractResponse(
                    success=False,
                    product=ProductInfo(
                        name=product_name,
                        brand=brand,
                        category=category,
                        gender=gender,
                        url=request.url
                    ),
                    size_chart=None,
                    message=f"No real size chart could be extracted from {platform}",
                    warnings=warnings
                )

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


@router.post("/ingest-chart", response_model=ProductChartIngestResponse)
async def ingest_extension_chart(request: ProductChartIngestRequest):
    """
    Accept a size chart extracted from a live product page by the browser extension.
    """
    try:
        normalized_chart, warnings = build_size_chart_from_extension(request)

        product = ProductInfo(
            name=request.product.title or "Unknown Product",
            brand=normalized_chart.brand,
            category=normalized_chart.category,
            gender=normalized_chart.gender,
            url=request.product.url
        )

        recommendation = None
        if request.measurements is not None:
            recommendation = chart_matcher.predict_size(
                measurements=request.measurements,
                size_chart=normalized_chart,
                use_standard_chart=False,
                category=normalized_chart.category,
                gender=normalized_chart.gender or "men"
            )

        return ProductChartIngestResponse(
            success=True,
            product=product,
            size_chart=normalized_chart,
            recommendation=recommendation,
            warnings=warnings
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Chart ingest error: {str(exc)}")
