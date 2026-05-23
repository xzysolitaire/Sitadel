const params = new URLSearchParams(window.location.search);
const site = params.get("site") || "this site";

document.getElementById("site-name").textContent = site;
document.getElementById("options-link").href = chrome.runtime.getURL("options.html");
