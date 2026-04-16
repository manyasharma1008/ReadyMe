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
  const SITE_PROFILES = [
    {
      id: "amazon",
      hostPattern: /(^|\.)amazon\./i,
      productUrlPatterns: [/\/dp\/[A-Z0-9]{8,}/i, /\/gp\/product\/[A-Z0-9]{8,}/i],
      productIdPatterns: [/\/dp\/([A-Z0-9]{8,})/i, /\/gp\/product\/([A-Z0-9]{8,})/i],
      productRootSelectors: ["#dp-container", "#ppd", "#dp", "#centerCol"],
      titleSelectors: ["#productTitle", "#title span", "#title"],
      brandSelectors: ["#bylineInfo", "#brand"],
      priceSelectors: [
        "#corePriceDisplay_desktop_feature_div .a-offscreen",
        "#corePrice_feature_div .a-offscreen",
        ".a-price .a-offscreen",
      ],
      imageSelectors: ["#landingImage", "#imgTagWrapperId img", "#main-image-container img"],
      galleryImageSelectors: ["#altImages img", "#imageBlockThumbs img", "#ivThumbs img"],
      sizeTriggerSelectors: [
        "#inline-twister-expander-header-size_name",
        "[id*='sizechart']",
        "[aria-label*='size chart']",
      ],
      chartContainerSelectors: [
        "#inline-twister-expander-content-size_name",
        "[id*='size-chart']",
        "[class*='size-chart']",
      ],
    },
    {
      id: "myntra",
      hostPattern: /(^|\.)myntra\.com$/i,
      productUrlPatterns: [/\/buy/i, /\/[a-z0-9-]+\/[a-z0-9-]+\/\d+\/buy/i],
      productIdPatterns: [/\/(\d+)\/buy/i],
      productRootSelectors: [
        "[class*='pdp-page']",
        "[class*='index-pdpContainer']",
        "[class*='pdp-details']",
      ],
      titleSelectors: [
        "h1[class*='pdp-name']",
        "h1[class*='product-name']",
        "[class*='pdp-productDescriptorsContainer'] h1:last-child",
      ],
      brandSelectors: [
        "h1[class*='pdp-title']",
        "[class*='pdp-productDescriptorsContainer'] h1:first-child",
      ],
      priceSelectors: [
        "span[class*='pdp-price'] strong",
        "[class*='pdp-price']",
        "[class*='price'] strong",
      ],
      imageSelectors: ["img[class*='image-grid-image']", "picture img", "img[class*='img-responsive']"],
      galleryImageSelectors: ["div[class*='image-grid'] img", "div[class*='thumbnails'] img"],
      sizeTriggerSelectors: [
        "[class*='sizeButtonsContainer'] button",
        "[class*='size-chart']",
        "[class*='sizeButton']",
      ],
      chartContainerSelectors: [
        "[class*='size-chart']",
        "[class*='sizeChart']",
        "[class*='sizeButtonsContainer']",
      ],
    },
    {
      id: "ajio",
      hostPattern: /(^|\.)ajio\.com$/i,
      productUrlPatterns: [/\/p\//i],
      productIdPatterns: [/\/p\/([^/?#]+)/i],
      productRootSelectors: [
        "[class*='prod-description']",
        "[class*='product-details']",
        "[class*='prod-container']",
      ],
      titleSelectors: ["h1[class*='prod-name']", "h1[class*='product-title']", "h1"],
      brandSelectors: ["div[class*='brand']", "span[class*='brand']"],
      priceSelectors: [
        "div[class*='prod-sp']",
        "span[class*='price']",
        "div[class*='price'] strong",
      ],
      imageSelectors: ["img[class*='rilrtl-lazy-img']", "picture img", "img[class*='prod-image']"],
      galleryImageSelectors: ["div[class*='prod-images'] img", "div[class*='thumbnail'] img"],
      sizeTriggerSelectors: [
        "[class*='size-chart']",
        "button[class*='size']",
        "div[class*='size'] button",
      ],
      chartContainerSelectors: [
        "[class*='size-chart']",
        "[class*='sizeChart']",
        "[class*='size-guide']",
      ],
    },
    {
      id: "meesho",
      hostPattern: /(^|\.)meesho\.com$/i,
      productUrlPatterns: [/\/p\//i],
      productIdPatterns: [/\/p\/([^/?#]+)/i],
      productRootSelectors: [
        "[class*='ProductPage']",
        "[class*='pdp']",
        "[class*='ProductDetails']",
      ],
      titleSelectors: ["h1[class*='Product']", "h1[class*='title']", "h1"],
      brandSelectors: ["div[class*='brand']", "span[class*='brand']"],
      priceSelectors: ["h4[class*='price']", "span[class*='price']", "div[class*='price']"],
      imageSelectors: ["img[class*='ProductImage']", "picture img", "img[class*='image']"],
      galleryImageSelectors: ["div[class*='ImageCarousel'] img", "div[class*='thumbnail'] img"],
      sizeTriggerSelectors: [
        "[class*='size-chart']",
        "button[class*='size']",
        "div[class*='size']",
      ],
      chartContainerSelectors: [
        "[class*='size-chart']",
        "[class*='sizeChart']",
        "[class*='size-guide']",
      ],
    },
  ];
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

  function getCurrentSiteProfile() {
    const hostname = window.location.hostname.toLowerCase();
    return SITE_PROFILES.find((profile) => profile.hostPattern.test(hostname)) || null;
  }

  function mergeSelectors(profileSelectors = [], genericSelectors = []) {
    return Array.from(new Set([...(profileSelectors || []), ...(genericSelectors || [])]));
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
    const siteProfile = getCurrentSiteProfile();
    for (const selector of mergeSelectors(siteProfile?.productRootSelectors, [])) {
      const element = document.querySelector(selector);
      if (element && isVisible(element)) return element;
    }

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
    const siteProfile = getCurrentSiteProfile();
    for (const pattern of siteProfile?.productIdPatterns || []) {
      const match = url.match(pattern);
      if (match) return match[1];
    }

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

  function queryText(selectors = [], root = document) {
    for (const selector of selectors) {
      const element = root.querySelector(selector);
      const text = cleanText(element?.innerText || element?.textContent || "");
      if (text) return text;
    }
    return "";
  }

  function queryElements(selectors = [], root = document) {
    const elements = [];
    for (const selector of selectors) {
      elements.push(...Array.from(root.querySelectorAll(selector)));
    }
    return elements;
  }

  function isLikelyImageUrl(url) {
    const normalized = String(url || "").toLowerCase();
    return (
      /\.(jpg|jpeg|png|webp|gif|avif)(?:$|\?)/.test(normalized) ||
      /(image|images|img|photo|media|cdn)/.test(normalized)
    );
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
    const siteProfile = getCurrentSiteProfile();
    const candidates = [];
    for (const selector of mergeSelectors(siteProfile?.chartContainerSelectors, CHART_CONTAINER_SELECTORS)) {
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

  function collectProductImages(root) {
    const siteProfile = getCurrentSiteProfile();
    const images = new Set();

    // OpenGraph
    const og = document.querySelector("meta[property='og:image']")?.content;
    if (og) images.add(new URL(og, location.href).href);

    // link rel image_src
    const linkImg = document.querySelector('link[rel="image_src"]')?.href;
    if (linkImg) images.add(new URL(linkImg, location.href).href);

    // Structured data (ld+json)
    const ldNodes = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
    for (const node of ldNodes) {
      try {
        const json = JSON.parse(node.textContent || "null");

        (function extract(v) {
          if (!v) return;
          if (typeof v === "string") {
            if (v.startsWith("http") && isLikelyImageUrl(v)) images.add(new URL(v, location.href).href);
            return;
          }
          if (Array.isArray(v)) return v.forEach(extract);
          if (typeof v === "object") {
            if (v.image) extract(v.image);
            if (v.url && isLikelyImageUrl(v.url)) images.add(new URL(v.url, location.href).href);
            Object.values(v).forEach(extract);
          }
        })(json);
      } catch (e) {
        // ignore invalid JSON
      }
    }

    for (const element of queryElements(mergeSelectors(siteProfile?.imageSelectors, siteProfile?.galleryImageSelectors), root || document)) {
      const src =
        element.currentSrc ||
        element.src ||
        element.getAttribute("data-src") ||
        element.getAttribute("data-lazy-src");
      if (!src) continue;
      images.add(new URL(src, location.href).href);
    }

    // Images from product root (prefer larger images)
    const imgEls = Array.from((root || document).querySelectorAll("img"));
    const candidates = imgEls
      .map((img) => {
        const src = img.currentSrc || img.src || img.getAttribute("data-src") || img.getAttribute("data-lazy-src");
        if (!src) return null;
        const abs = new URL(src, location.href).href;
        const area = (img.naturalWidth || img.width || 0) * (img.naturalHeight || img.height || 0);
        return { src: abs, area };
      })
      .filter(Boolean)
      .sort((a, b) => b.area - a.area);

    for (const c of candidates.slice(0, 12)) images.add(c.src);

    return Array.from(images).slice(0, 12);
  }

  async function openSizeChartIfNeeded() {
    const siteProfile = getCurrentSiteProfile();
    const siteSpecificTriggers = queryElements(siteProfile?.sizeTriggerSelectors || [], getSearchRoot()).slice(0, 8);

    for (const trigger of siteSpecificTriggers) {
      const clickable = trigger.closest("button, a, [role='button'], summary, [onclick]") || trigger;
      if (!isVisible(clickable)) continue;
      clickable.click();
      await wait(500);
      const containers = findChartContainers();
      if (containers.length > 0) return true;
    }

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
    const siteProfile = getCurrentSiteProfile();
    const root = getProductRoot();
    const siteBrand = queryText(siteProfile?.brandSelectors || [], root);
    const siteTitle = queryText(siteProfile?.titleSelectors || [], root);
    const title =
      siteTitle ||
      cleanText(document.querySelector("meta[property='og:title']")?.content) ||
      cleanText(root.querySelector("h1")?.innerText) ||
      cleanText(document.title);
    const siteImage = queryElements(siteProfile?.imageSelectors || [], root)[0];
    const initialImage =
      siteImage?.currentSrc ||
      siteImage?.src ||
      document.querySelector("meta[property='og:image']")?.content ||
      document.querySelector("link[rel='image_src']")?.href ||
      root.querySelector("img")?.src ||
      "";

    const images = collectProductImages(root);
    const image = initialImage ? new URL(initialImage, location.href).href : (images[0] || "");
    const price =
      queryText(siteProfile?.priceSelectors || [], root) ||
      cleanText(document.querySelector("meta[property='product:price:amount']")?.content) ||
      cleanText(root.querySelector("[class*='price'], [data-testid*='price']")?.innerText);
    const pageText = getPageTextSample();

    return {
      url: window.location.href,
      title,
      image,
      images,
      price,
      product_id: detectProductId(window.location.href),
      brand: siteBrand || cleanText(root.querySelector('[data-brand], [class*="brand"]')?.innerText) || null,
      category: detectCategory(`${window.location.href.toLowerCase()} ${pageText}`),
      gender: detectGender(`${window.location.href.toLowerCase()} ${pageText}`),
      site_name: window.location.hostname.replace(/^www\./i, ""),
    };
  }

  function isLikelyProductPage(product) {
    const pageText = getPageTextSample();
    const siteProfile = getCurrentSiteProfile();
    const positiveSignals = [
      Boolean(product.title),
      Boolean(product.image),
      Boolean(product.price),
      PRODUCT_HINTS.some((hint) => pageText.includes(hint)),
      /\/(dp|gp\/product|product|products|p)\//i.test(window.location.pathname),
      siteProfile?.productUrlPatterns?.some((pattern) => pattern.test(window.location.href)),
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
