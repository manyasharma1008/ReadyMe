function getProductData() {
  const image = document.querySelector("img")?.src || ""
  const price = document.querySelector("[class*=price]")?.innerText || ""
  const title = document.querySelector("h1")?.innerText || ""

  return {
    image,
    price,
    title,
    url: window.location.href
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "GET_PRODUCT") {
    sendResponse(getProductData())
  }
})