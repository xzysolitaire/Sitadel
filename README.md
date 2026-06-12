# Sitadel

A lightweight Chrome extension that lets you block distracting websites. Add any site to your block list and every future visit is redirected to a friendly blocked page instead.

## What it does

- **Block any site** — add a domain (`facebook.com`) or a specific path (`reddit.com/r/news`) to your block list.
- **One-click quick-add** — open the popup while visiting a site and click **Block** to add it instantly.
- **Save pages for later** — click **Save** in the popup to bookmark the current page; it's tagged automatically as `article`, `video`, `audio`, `paper`, `docs`, or `page`.
- **Rename before you save** — tap the page name in the popup to edit it, so saved pages read the way you want.
- **Build a reading list** — give a saved page a deadline (Tomorrow, 3 days, 7 days, 30 days, 3 months) or drop it in the **Backlog**; the popup shows when it's due and lets you **Mark read** when you're done.
- **Manage your lists** — view, add, or remove blocked sites and saved pages from the settings page at any time.
- **Redirect, don't just hide** — blocked sites are intercepted at the network level and replaced with a clear blocked page.

### Popup

<img width="286" height="188" alt="Screenshot 2026-06-09 at 3 34 45 PM" src="https://github.com/user-attachments/assets/01720dad-157c-4bb1-a14c-f55b8dc6a487" />

## Installation

Sitadel is not on the Chrome Web Store — install it as an unpacked extension in Developer Mode.

1. **Download the source**

   Clone this repo or download and unzip it:
   ```bash
   git clone https://github.com/xzysolitaire/Sitadel.git
   ```

2. **Open Chrome Extensions**

   Go to `chrome://extensions` in your browser.

3. **Enable Developer Mode**

   Toggle **Developer mode** on (top-right corner of the page).

4. **Load the extension**

   Click **Load unpacked**, then select the `Sitadel` folder.

5. **Pin it (optional)**

   Click the puzzle-piece icon in the Chrome toolbar → find **Sitadel** → click the pin icon so the popup is always one click away.

## Key components

| Component | Role |
|---|---|
| `popup.js` | Handles block and save/unsave actions from the toolbar popup |
| `service_worker.js` | Listens for storage changes; rebuilds `declarativeNetRequest` rules |
| `pageTypeDetector.js` | Classifies a page as `article`, `video`, `audio`, `paper`, `docs`, or `page` via URL patterns and DOM signals |
| `options.js` | Manages the blocked-sites list and saved-pages list; supports sort, filter, and tab switching |
| `chrome.storage.sync` | Single source of truth for both the block list and saved pages; syncs across devices |
| `declarativeNetRequest` | Chrome API that intercepts matching requests before they leave the browser |
| `blocked.html` | Redirect target; reads the blocked domain from the URL query string |
