# Sitadel

A lightweight Chrome extension that lets you block distracting websites. Add any site to your block list and every future visit is redirected to a friendly blocked page instead.

## What it does

- **Block any site** — add a domain (`facebook.com`) or a specific path (`reddit.com/r/news`) to your block list.
- **One-click quick-add** — open the popup while visiting a site and click **Block this site** to add it instantly.
- **Save pages for later** — click **Save** in the popup to bookmark the current page; it's tagged automatically as `article`, `video`, `audio`, `paper`, `docs`, or `page`.
- **Manage your lists** — view, add, or remove blocked sites and saved pages from the settings page at any time.
- **Redirect, don't just hide** — blocked sites are intercepted at the network level and replaced with a clear blocked page.

### Popup

<img width="283" height="153" alt="Screenshot 2026-06-04 at 12 44 19 AM" src="https://github.com/user-attachments/assets/b4e95c7c-2054-4c3f-b092-5695d674d4d4" />

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

## Usage

| What you want to do | How |
|---|---|
| Block the site you're on | Click the Sitadel toolbar icon → **Block this site** |
| Block a site manually | Open settings → **Blocked** tab → type a domain or path → **Add** |
| Unblock a site | Open settings → **Blocked** tab → click **Remove** next to the entry |
| Save a page for later | Click the Sitadel toolbar icon → **Save** |
| Unsave a page | Click the Sitadel toolbar icon → **Unsave**, or open settings → **Saved** tab → click **×** |
| Browse saved pages | Open settings → **Saved** tab; filter by site or content type, sort by date or name |

**Key components:**

| Component | Role |
|---|---|
| `popup.js` | Handles block and save/unsave actions from the toolbar popup |
| `service_worker.js` | Listens for storage changes; rebuilds `declarativeNetRequest` rules |
| `pageTypeDetector.js` | Classifies a page as `article`, `video`, `audio`, `paper`, `docs`, or `page` via URL patterns and DOM signals |
| `options.js` | Manages the blocked-sites list and saved-pages list; supports sort, filter, and tab switching |
| `chrome.storage.sync` | Single source of truth for both the block list and saved pages; syncs across devices |
| `declarativeNetRequest` | Chrome API that intercepts matching requests before they leave the browser |
| `blocked.html` | Redirect target; reads the blocked domain from the URL query string |
