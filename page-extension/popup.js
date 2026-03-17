console.log("POPUP JS LOADED")

document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM READY")

  const btn = document.getElementById("scan")
  console.log("BTN:", btn)

  if (!btn) {
    console.error("BUTTON NOT FOUND")
    return
  }

  btn.addEventListener("click", () => {

    console.log("BUTTON CLICKED")

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {

      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        files: ["content.js"]
      }, () => {

        chrome.tabs.sendMessage(
          tabs[0].id,
          { action: "GET_PRODUCT" },
          (product) => {

            if (chrome.runtime.lastError) {
              console.error("ERROR:", chrome.runtime.lastError.message)
              return
            }

            console.log("PRODUCT:", product)

            const encoded = encodeURIComponent(JSON.stringify(product))

            chrome.tabs.create({
              url: `http://localhost:5173/?data=${encoded}`
            })

          }
        )

      })

    })

  })
})