(function initReadyMeExtractor(globalScope) {
  const SIZE_KEYWORDS = ["size chart", "size guide", "measurement", "size & fit", "size info"];
  const PRODUCT_HINTS = ["add to cart", "buy now", "select size", "size", "wishlist"];
  const SIZE_LABEL_PATTERN = /^(xxxs|xxs|xs|s|m|l|xl|xxl|xxxl|4xl|5xl|\d{1,3}|[a-z]{1,4}\/[a-z]{1,4})$/i;
  const MEASUREMENT_ALIASES = {
    chest: "chest",
    bust: "chest",
    waist: "waist",
    hip: "hips",
    hips: "hips",
    seat: "hips",
    shoulder: "shoulder_width",
    shoulders: "shoulder_width",
    "shoulder width": "shoulder_width",
    length: "height",
    height: "height",
    inseam: "height",
    outseam: "height",
  };

  function cleanText(value) {
    return (value || "").replace(/\s+/g, " ").trim();
  }

  function lowerText(value) {
    return cleanText(value).toLowerCase();
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function isVisible(element) {
    if (!element || !(element instanceof Element)) return false;
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }

  function getPageTextSample() {
    return lowerText(document.body?.innerText || "").slice(0, 8000);
  }

  function detectProductId(url) {
    const patterns = [
      /\/dp\/([A-Z0-9]{8,})/i,
      /\/gp\/product\/([A-Z0-9]{8,})/i,
      /[?&]pid=([A-Z0-9_-]+)/i,
      /\/products?\/([^/?#]+)/i,
      /\/p\/([^/?#]+)/i,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }

    return null;
  }

  function detectCategory(text) {
    const categoryMap = {
      shirts: ["shirt", "t-shirt", "tshirt", "top", "blouse", "polo"],
      pants: ["pant", "jean", "trouser", "legging", "shorts"],
      dresses: ["dress", "gown", "kurti", "saree"],
      jackets: ["jacket", "blazer", "coat", "hoodie", "sweater"],
    };

    for (const [category, keywords] of Object.entries(categoryMap)) {
      if (keywords.some((keyword) => text.includes(keyword))) {
        return category;
      }
    }

    return "shirts";
  }

  function detectGender(text) {
    if (/\b(men|mens|male|boy)\b/.test(text)) return "men";
    if (/\b(women|womens|female|girl)\b/.test(text)) return "women";
    if (/\b(unisex)\b/.test(text)) return "unisex";
    return null;
  }

  function detectUnit(text) {
    const sample = lowerText(text);
    if (/\b(inches|inch|in)\b|"/.test(sample)) return "inches";
    if (/\bcm|centimeter|centimetre\b/.test(sample)) return "cm";
    return "cm";
  }

  function normalizeMeasurementName(label) {
    const normalized = lowerText(label).replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
    if (MEASUREMENT_ALIASES[normalized]) return MEASUREMENT_ALIASES[normalized];

    for (const [alias, canonical] of Object.entries(MEASUREMENT_ALIASES)) {
      if (normalized.includes(alias)) return canonical;
    }

    return null;
  }

  function isLikelySizeLabel(value) {
    const text = cleanText(value).toUpperCase();
    return SIZE_LABEL_PATTERN.test(text) || /^W?\d{2,3}$/i.test(text);
  }

  function parseMeasurementValue(text) {
    const normalized = cleanText(text).replace(/,/g, "");
    const rangeMatch = normalized.match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/);
    if (rangeMatch) {
      return Number(((Number(rangeMatch[1]) + Number(rangeMatch[2])) / 2).toFixed(2));
    }

    const matches = normalized.match(/\d+(?:\.\d+)?/g);
    if (!matches || matches.length === 0) return null;

    return Number(matches[0]);
  }

  function getSelector(element) {
    if (!element) return null;
    if (element.id) return `#${element.id}`;
    const classes = Array.from(element.classList || []).slice(0, 3).join(".");
    return `${element.tagName.toLowerCase()}${classes ? `.${classes}` : ""}`;
  }

  function scoreTable(headers, rows) {
    const headerScore = headers.reduce((score, header) => {
      const normalized = normalizeMeasurementName(header);
      return score + (normalized ? 2 : header.includes("size") ? 3 : 0);
    }, 0);
    return headerScore + rows.length;
  }

  function parseTable(table) {
    const rows = Array.from(table.querySelectorAll("tr")).slice(0, 25);
    if (rows.length < 2) return null;

    const matrix = rows
      .map((row) => Array.from(row.querySelectorAll("th, td")).map((cell) => cleanText(cell.innerText)))
      .filter((row) => row.length >= 2);

    if (matrix.length < 2) return null;

    const headers = matrix[0].map((header) => lowerText(header));
    const sizeIndex = headers.findIndex((header) => header.includes("size"));
    const resolvedSizeIndex = sizeIndex >= 0 ? sizeIndex : 0;
    const measurementColumns = headers
      .map((header, index) => ({ key: normalizeMeasurementName(header), index }))
      .filter((item) => item.index !== resolvedSizeIndex && item.key);

    if (measurementColumns.length === 0) return null;

    const sizes = [];
    for (const row of matrix.slice(1)) {
      const label = cleanText(row[resolvedSizeIndex] || row[0]);
      if (!isLikelySizeLabel(label)) continue;

      const measurements = {};
      for (const column of measurementColumns) {
        const value = parseMeasurementValue(row[column.index]);
        if (value !== null) {
          measurements[column.key] = value;
        }
      }

      if (Object.keys(measurements).length > 0) {
        sizes.push({ label: label.toUpperCase(), measurements });
      }
    }

    if (sizes.length < 2) return null;

    return {
      sizes,
      unit: detectUnit(table.innerText),
      source_type: "table",
      source_selector: getSelector(table),
      confidence: Math.min(0.95, 0.45 + scoreTable(headers, sizes) / 25),
      warnings: [],
    };
  }

  function parsePseudoRows(container) {
    const rowCandidates = Array.from(
      container.querySelectorAll('[role="row"], li, .row, .size-row, .sizeRow, .size-chart-row')
    ).slice(0, 40);
    if (rowCandidates.length < 2) return null;

    const rows = rowCandidates
      .map((row) => Array.from(row.children).map((child) => cleanText(child.innerText)))
      .filter((cells) => cells.length >= 2);

    if (rows.length < 2) return null;

    const headers = rows[0].map((cell) => lowerText(cell));
    const sizeIndex = headers.findIndex((header) => header.includes("size"));
    const resolvedSizeIndex = sizeIndex >= 0 ? sizeIndex : 0;
    const measurementColumns = headers
      .map((header, index) => ({ key: normalizeMeasurementName(header), index }))
      .filter((item) => item.index !== resolvedSizeIndex && item.key);

    if (measurementColumns.length === 0) return null;

    const sizes = [];
    for (const row of rows.slice(1)) {
      const label = cleanText(row[resolvedSizeIndex] || row[0]);
      if (!isLikelySizeLabel(label)) continue;

      const measurements = {};
      for (const column of measurementColumns) {
        const value = parseMeasurementValue(row[column.index]);
        if (value !== null) {
          measurements[column.key] = value;
        }
      }

      if (Object.keys(measurements).length > 0) {
        sizes.push({ label: label.toUpperCase(), measurements });
      }
    }

    if (sizes.length < 2) return null;

    return {
      sizes,
      unit: detectUnit(container.innerText),
      source_type: "grid",
      source_selector: getSelector(container),
      confidence: Math.min(0.85, 0.4 + sizes.length / 12),
      warnings: [],
    };
  }

  function findChartContainers() {
    const candidates = [];
    const selectors = [
      "table",
      '[role="dialog"]',
      '[aria-modal="true"]',
      ".modal",
      ".popup",
      '[class*="size"]',
      '[id*="size"]',
      '[data-testid*="size"]',
    ];

    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        if (candidates.length >= 30) break;
        const text = lowerText(element.innerText);
        const ariaHidden = element.getAttribute("aria-hidden") === "true";
        if (!isVisible(element) && ariaHidden) continue;
        if (!text.includes("size")) continue;
        if (!/(chest|waist|hip|bust|shoulder|length|height)/.test(text)) continue;
        candidates.push(element);
      }
      if (candidates.length >= 30) break;
    }

    return candidates;
  }

  async function openSizeChartIfNeeded() {
    const triggers = Array.from(document.querySelectorAll("button, a, [role='button'], summary")).filter((element) => {
      const text = lowerText(element.innerText || element.getAttribute("aria-label"));
      return SIZE_KEYWORDS.some((keyword) => text.includes(keyword));
    }).slice(0, 5);

    for (const trigger of triggers) {
      if (!isVisible(trigger)) continue;
      trigger.click();
      await wait(300);
      const containers = findChartContainers();
      if (containers.length > 0) return true;
    }

    return false;
  }

  function extractProductContext() {
    const title =
      cleanText(document.querySelector("meta[property='og:title']")?.content) ||
      cleanText(document.querySelector("h1")?.innerText) ||
      cleanText(document.title);
    const image =
      document.querySelector("meta[property='og:image']")?.content ||
      document.querySelector("img")?.src ||
      "";
    const price =
      cleanText(document.querySelector("meta[property='product:price:amount']")?.content) ||
      cleanText(document.querySelector("[class*='price'], [data-testid*='price']")?.innerText);
    const pageText = getPageTextSample();

    return {
      url: window.location.href,
      title,
      image,
      price,
      product_id: detectProductId(window.location.href),
      brand: cleanText(document.querySelector('[data-brand], [class*="brand"]')?.innerText) || null,
      category: detectCategory(`${window.location.href.toLowerCase()} ${pageText}`),
      gender: detectGender(`${window.location.href.toLowerCase()} ${pageText}`),
      site_name: window.location.hostname,
    };
  }

  function isLikelyProductPage(product) {
    const pageText = getPageTextSample();
    const positiveSignals = [
      Boolean(product.title),
      Boolean(product.image),
      Boolean(product.price),
      PRODUCT_HINTS.some((hint) => pageText.includes(hint)),
      /\/(dp|gp\/product|product|products|p)\//i.test(window.location.pathname),
    ].filter(Boolean).length;

    return positiveSignals >= 2;
  }

  async function extractSizeChart() {
    let candidates = findChartContainers();
    if (candidates.length === 0) {
      await openSizeChartIfNeeded();
      candidates = findChartContainers();
    }

    const parsedCharts = [];
    for (const candidate of candidates) {
      const parsedTable = candidate.tagName === "TABLE" ? parseTable(candidate) : null;
      const parsedGrid = parsedTable ? null : parsePseudoRows(candidate);
      const parsed = parsedTable || parsedGrid;
      if (parsed) parsedCharts.push(parsed);
    }

    parsedCharts.sort((left, right) => (right.confidence || 0) - (left.confidence || 0));
    return parsedCharts[0] || null;
  }

  async function extractProductPayload() {
    const product = extractProductContext();
    const warnings = [];
    const isProductPage = isLikelyProductPage(product);

    if (!isProductPage) {
      warnings.push("Current page does not look like a product detail page.");
    }

    const sizeChart = isProductPage ? await extractSizeChart() : null;
    if (isProductPage && !sizeChart) {
      warnings.push("No size chart was detected on this page.");
    }

    return {
      product,
      isProductPage,
      sizeChart,
      warnings,
    };
  }

  globalScope.ReadyMeExtractor = {
    extractProductContext,
    extractProductPayload,
  };
})(globalThis);
