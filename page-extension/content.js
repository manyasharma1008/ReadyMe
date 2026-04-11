chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (typeof ReadyMeExtractor === "undefined") {
    console.error("[ReadyMe] ReadyMeExtractor is not available on this page.");
    sendResponse({
      product: {
        url: window.location.href,
        title: document.title || "",
        image: "",
        price: "",
        product_id: null,
        brand: null,
        category: null,
        gender: null,
        site_name: window.location.hostname,
      },
      isProductPage: false,
      sizeChart: null,
      warnings: ["Extractor not loaded (content script init failed)."],
    });
    return false;
  }

  if (request.action === "GET_PRODUCT") {
    sendResponse(ReadyMeExtractor.extractProductContext());
    return false;
  }

  if (request.action === "EXTRACT_PRODUCT_CONTEXT") {
    ReadyMeExtractor.extractProductPayload()
      .then((payload) => sendResponse(payload))
      .catch((error) => {
        console.error("[ReadyMe] Extraction error:", error);
        sendResponse({
          product: ReadyMeExtractor.extractProductContext(),
          isProductPage: false,
          sizeChart: null,
          warnings: [error.message || "Unexpected extraction error"],
        });
      });

    return true;
  }

  return false;
});
