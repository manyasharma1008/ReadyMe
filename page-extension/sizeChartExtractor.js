(function initReadyMeExtractor(globalScope) {
  const SIZE_KEYWORDS = ["size chart", "size guide", "measurement", "size & fit", "size info"];
  const PRODUCT_HINTS = ["add to cart", "buy now", "select size", "size", "wishlist"];
  const SIZE_TRIGGER_KEYWORDS = [
    "size chart",
    "size guide",
    "size & fit",
    "fit guide",
    "size info",
    "view size",
    "check size",
    "measurement",
  ];
  // woienf
  const PRODUCT_ROOT_SELECTORS = [
    "#productDetails_detailBullets_sections1",
    "#productDetail_techSpec_section_1",
    "#feature-bullets",
    "#ppd",
    '[data-testid="product-page"]',
    '[data-testid="pdp"]',
    '[data-test="product-page"]',
    '[class*="product"]',
    '[id*="product"]',
  ];
  const SIZE_TRIGGER_SELECTORS = [
    "button",
    "a",
    "[role='button']",
    "summary",
    "[aria-label]",
    "[data-testid]",
    "[data-test]",
  ];
  const CHART_CONTAINER_SELECTORS = [
    "table",
    "dialog",
    '[role="dialog"]',
    '[aria-modal="true"]',
    '[role="dialog"] table',
    '[role="dialog"] div',
    '[role="dialog"] section',
    ".modal",
    ".popup",
    ".drawer",
    ".sheet",
    ".bottom-sheet",
    '[class*="size"]',
    '[id*="size"]',
    '[data-testid*="size"]',
    '[data-test*="size"]',
  ];
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

  function getProductRoot() {
    for (const selector of PRODUCT_ROOT_SELECTORS) {
      const element = document.querySelector(selector);
      if (element && isVisible(element)) return element;
    }
    return document.body;
  }

  function getSearchRoot() {
    return document.body || document.documentElement;
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

  function isSizeChartCandidate(element) {
    if (!element) return false;
    const text = lowerText(element.innerText || "");
    if (!text.includes("size")) return false;
    return /(chest|waist|hip|bust|shoulder|length|height|inseam|outseam|sleeve)/.test(text);
  }

  function isTriggerCandidate(element) {
    if (!element) return false;
    const text = lowerText(element.innerText || element.getAttribute("aria-label") || element.getAttribute("title") || "");
    return SIZE_TRIGGER_KEYWORDS.some((keyword) => text.includes(keyword));
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

  function parseMatrixRows(matrix, sourceType, sourceSelector) {
    if (matrix.length < 2) return null;

    const rowOriented = parseRowOrientedMatrix(matrix, sourceType, sourceSelector);
    const columnOriented = parseColumnOrientedMatrix(matrix, sourceType, sourceSelector);

    const candidates = [rowOriented, columnOriented].filter((chart) => chart && chart.sizes.length > 0);
    candidates.sort((left, right) => (right.confidence || 0) - (left.confidence || 0));
    return candidates[0] || null;
  }

  function parseRowOrientedMatrix(matrix, sourceType, sourceSelector) {
    const headerRow = matrix[0].map((cell) => cleanText(cell));
    const sizeIndex = headerRow.findIndex((cell) => isLikelySizeLabel(cell));
    const resolvedSizeIndex = sizeIndex >= 0 ? sizeIndex : 0;
    const measurementHeaders = headerRow
      .map((header, index) => ({ index, key: normalizeMeasurementName(header) }))
      .filter((item) => item.index !== resolvedSizeIndex && item.key);

    if (measurementHeaders.length === 0) return null;

    const sizes = [];
    for (const row of matrix.slice(1)) {
      const label = cleanText(row[resolvedSizeIndex] || row[0]);
      if (!isLikelySizeLabel(label)) continue;

      const measurements = {};
      for (const header of measurementHeaders) {
        if (header.index >= row.length) continue;
        const value = parseMeasurementValue(row[header.index]);
        if (value !== null) {
          measurements[header.key] = value;
        }
      }

      if (Object.keys(measurements).length > 0) {
        sizes.push({ label: label.toUpperCase(), measurements });
      }
    }

    if (sizes.length < 2) return null;

    return {
      sizes,
      unit: detectUnit(matrix.flat().join(" ")),
      source_type: sourceType,
      source_selector: sourceSelector,
      confidence: Math.min(0.9, 0.45 + sizes.length / 12),
      warnings: [],
    };
  }

  function parseColumnOrientedMatrix(matrix, sourceType, sourceSelector) {
    const headerRow = matrix[0].map((cell) => cleanText(cell));
    const sizeColumns = headerRow
      .map((cell, index) => ({ index, label: cleanText(cell).toUpperCase() }))
      .filter((item) => item.index > 0 && isLikelySizeLabel(item.label));

    if (sizeColumns.length === 0) return null;

    const measurementRows = matrix.slice(1)
      .map((row) => ({
        key: normalizeMeasurementName(row[0] || ""),
        row,
      }))
      .filter((item) => item.key);

    if (measurementRows.length === 0) return null;

    const sizeEntries = sizeColumns.map(({ index, label }) => ({
      label,
      measurements: {},
    }));

    for (const measurementRow of measurementRows) {
      for (const sizeEntry of sizeEntries) {
        const sizeIndex = sizeColumns.find((column) => column.label === sizeEntry.label)?.index;
        if (sizeIndex == null || sizeIndex >= measurementRow.row.length) continue;
        const value = parseMeasurementValue(measurementRow.row[sizeIndex]);
        if (value !== null) {
          sizeEntry.measurements[measurementRow.key] = value;
        }
      }
    }

    const sizes = sizeEntries.filter((entry) => Object.keys(entry.measurements).length > 0)
      .map((entry) => ({ label: entry.label, measurements: entry.measurements }));

    if (sizes.length < 2) return null;

    return {
      sizes,
      unit: detectUnit(matrix.flat().join(" ")),
      source_type: sourceType,
      source_selector: sourceSelector,
      confidence: Math.min(0.85, 0.4 + sizes.length / 12),
      warnings: [],
    };
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

    return parseMatrixRows(matrix, "table", getSelector(table));
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

    return parseMatrixRows(rows, "grid", getSelector(container));
  }

  function parseLooseTextChart(root) {
    const text = cleanText(root?.innerText || "");
    if (!text || text.length < 40) return null;

    const segments = text
      .split(/\n{2,}|(?:\s{2,})/g)
      .map(cleanText)
      .filter((segment) => segment.length >= 20 && segment.length <= 500)
      .slice(0, 60);

    const measurementHints = ["chest", "waist", "hip", "bust", "shoulder", "length", "height", "inseam", "outseam"];
    const sizePattern = /\b(?:xxxs|xxs|xs|s|m|l|xl|xxl|xxxl|4xl|5xl|\d{1,3})\b/i;

    const sizes = [];
    for (const segment of segments) {
      const lowered = lowerText(segment);
      if (!measurementHints.some((hint) => lowered.includes(hint))) continue;
      if (!sizePattern.test(segment)) continue;

      const rowMatches = segment.match(/\b(?:xxxs|xxs|xs|s|m|l|xl|xxl|xxxl|4xl|5xl|\d{1,3})\b/gi) || [];
      const measurementTokens = {};

      for (const hint of measurementHints) {
        const hintIndex = lowered.indexOf(hint);
        if (hintIndex < 0) continue;

        const afterHint = segment.slice(hintIndex, hintIndex + 80);
        const value = parseMeasurementValue(afterHint);
        if (value !== null) {
          const canonical = normalizeMeasurementName(hint);
          if (canonical) measurementTokens[canonical] = value;
        }
      }

      const uniqueLabels = Array.from(new Set(rowMatches.map((label) => label.toUpperCase())));
      for (const label of uniqueLabels) {
        if (Object.keys(measurementTokens).length > 0) {
          sizes.push({ label, measurements: { ...measurementTokens } });
        }
      }
    }

    const deduped = [];
    const seen = new Set();
    for (const entry of sizes) {
      const key = `${entry.label}:${JSON.stringify(entry.measurements)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(entry);
    }

    if (deduped.length < 2) return null;

    return {
      sizes: deduped.slice(0, 12),
      unit: detectUnit(text),
      source_type: "text",
      source_selector: null,
      confidence: 0.35,
      warnings: ["Chart parsed from page text fallback."],
    };
  }

  function findChartContainers() {
    const candidates = [];
    for (const selector of CHART_CONTAINER_SELECTORS) {
      const elements = getProductRoot().querySelectorAll(selector);
      for (const element of elements) {
        if (candidates.length >= 30) break;
        const ariaHidden = element.getAttribute("aria-hidden") === "true";
        if (!isVisible(element) && ariaHidden) continue;
        if (!isSizeChartCandidate(element)) continue;
        candidates.push(element);
      }
      if (candidates.length >= 30) break;
    }

    return candidates;
  }

  async function openSizeChartIfNeeded() {
    const triggers = Array.from(getSearchRoot().querySelectorAll(SIZE_TRIGGER_SELECTORS.join(",")))
      .filter(isTriggerCandidate)
      .slice(0, 8);

    for (const trigger of triggers) {
      if (!isVisible(trigger)) continue;
      trigger.click();
      await wait(500);
      const containers = findChartContainers();
      if (containers.length > 0) return true;
    }

    const secondaryTriggers = Array.from(
      getProductRoot().querySelectorAll("span, div, p, li, label")
    )
      .filter((element) => {
        const text = lowerText(element.innerText || "");
        return SIZE_TRIGGER_KEYWORDS.some((keyword) => text.includes(keyword));
      })
      .slice(0, 5);

    for (const trigger of secondaryTriggers) {
      const clickable = trigger.closest("button, a, [role='button'], summary, [onclick]") || trigger;
      if (!isVisible(clickable)) continue;
      clickable.click();
      await wait(500);
      const containers = findChartContainers();
      if (containers.length > 0) return true;
    }

    return false;
  }

  function extractProductContext() {
    const root = getProductRoot();
    const title =
      cleanText(document.querySelector("meta[property='og:title']")?.content) ||
      cleanText(root.querySelector("h1")?.innerText) ||
      cleanText(document.title);
    const image =
      document.querySelector("meta[property='og:image']")?.content ||
      root.querySelector("img")?.src ||
      "";
    const price =
      cleanText(document.querySelector("meta[property='product:price:amount']")?.content) ||
      cleanText(root.querySelector("[class*='price'], [data-testid*='price']")?.innerText);
    const pageText = getPageTextSample();

    return {
      url: window.location.href,
      title,
      image,
      price,
      product_id: detectProductId(window.location.href),
      brand: cleanText(root.querySelector('[data-brand], [class*="brand"]')?.innerText) || null,
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
    const cached = window.__readyMeLastSizeChart;
    if (cached && cached.url === window.location.href && Date.now() - cached.timestamp < 3000) {
      return cached.sizeChart;
    }

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

    if (parsedCharts.length === 0) {
      const productRoot = getProductRoot();
      const looseTextChart = parseLooseTextChart(productRoot);
      if (looseTextChart) {
        parsedCharts.push(looseTextChart);
      }
    }

    parsedCharts.sort((left, right) => (right.confidence || 0) - (left.confidence || 0));
    const bestMatch = parsedCharts[0] || null;
    window.__readyMeLastSizeChart = {
      url: window.location.href,
      timestamp: Date.now(),
      sizeChart: bestMatch,
    };
    return bestMatch;
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

    if (sizeChart) {
      warnings.push(`Detected ${sizeChart.sizes.length} size rows from ${sizeChart.source_type || "unknown source"}.`);
    }

    console.log("[ReadyMe] Product context:", product);
    console.log("[ReadyMe] Extracted size chart:", sizeChart);

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
