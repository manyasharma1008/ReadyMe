document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("scan")

  if (!btn) return

  btn.addEventListener("click", () => {

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {

      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        files: ["content.js"]
      }, () => {

        chrome.tabs.sendMessage(
          tabs[0].id,
          { action: "GET_PRODUCT" },
          (product) => {

            if (chrome.runtime.lastError) return

            const encoded = encodeURIComponent(JSON.stringify(product))

            chrome.tabs.create({
              url: `https://ready-me-liart.vercel.app/?data=${encoded}`
            })

          }
        )

      })

    })

  })
})