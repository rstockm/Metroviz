# MetroViz

MetroViz is a lightweight framework for visualizing strategic technology decisions. It presents project roadmaps and software lifecycles in the style of a classic metro map.

## Features

* **Interactive metro map**: Visualizes technology areas (zones) and software lifecelines running through them.
* **Visual editor**: A built-in, form-based editor for fast data entry in the browser; changes update the map in real time.
* **JSON mode**: A split-screen mode where raw JSON can be edited and validated directly.
* **Classic view (text)**: Automatically generates a structured project view in Markdown, suitable for specifications or traditional project management.
* **Stops & milestones**: Rich planning via station types:
  * Start & end (terminus)
  * Milestones (round nodes)
  * Regular stops (smaller, low-key intermediate steps without heavy labels)
  * Transfer stations (visible transitions or migrations between technologies)
* **Smart routing**: Lines avoid each other automatically; labels are placed with collision detection; transfer connectors curve naturally.
* **Local persistence**: Changes, new roadmaps, and copies are stored in the browser’s `localStorage`. No database required.
* **URL state**: Editor visibility, map vs. text view, and the selected saved file can be shared or bookmarked via the URL.
* **Share via link (`?data=`)**: **Share** embeds the current roadmap as an LZ-String–compressed query parameter; the link opens the same data with no backend (after the first load, `data` / `source` are removed from the address bar to keep URLs short).
* **Remote load (`?source=`)**: Load a roadmap from any host with `?source=<URL-to-a-.json-file>` if CORS allows the request (errors are shown in the editor).
* **Exports**:
  * **SVG**: Download the metro map as vector graphics.
  * **JSON**: Export raw data for backup or sharing.
  * **Markdown**: Download the generated text view as `.md`.
* **Dark editor UI**: Dark editor chrome separate from the light, readable map.
* **Markdown descriptions**: Stations can include Markdown descriptions, rendered in hover tooltips and in the text export.
* **Automatic timing**: Tooltips show duration in weeks to the next milestone.

## Technology stack

MetroViz is a fully static, client-side web app (“serverless”). It needs no backend and runs on any standard web host (e.g. GitHub Pages, Apache, Nginx) or locally.

### Frontend

* **Vanilla HTML5, CSS3, JavaScript (ES6 modules)**: Core app split into modules (`app.js`, `data-model.js`, `layout-engine.js`, `metro-renderer.js`).
* **D3.js (v7)**: Rendering and scales (`d3.scaleTime`), SVG paths, circles, curves, zoom, and pan.
* **Alpine.js (v3)**: Lightweight reactive UI: two-way binding between JSON state and the visual editor (forms, buttons, collapsibles) and DOM visibility (`x-show`, `x-model`, `x-for`).
* **Marked.js**: Markdown parser for station descriptions and the text view (HTML for tooltips and Markdown view).
* **LZ-String**: URL-safe compression for the **Share** feature (`?data=`).
* **CSS Grid & Flexbox**: Responsive split layout and editor structure; CSS variables for theming.

### Data

* **JSON**: Canonical format for roadmap definitions.
* **localStorage API**: Persists multiple named files on the client.

### URL parameters (decentralized loading)

Startup priority: `data` (compressed payload) → `source` (remote URL) → `file` (saved local file from index) → last-used / example roadmap.

| Parameter | Description |
|-----------|-------------|
| `data` | LZ-String–compressed JSON (URL-encoded), as produced by the Share button. |
| `source` | Full HTTPS URL to a `.json` file; the server must send appropriate CORS headers. |
| `editor`, `view`, `file` | As before: editor on/off, view (`map` / `markdown`), selected indexed local file. |

## Running locally

Clone the repository and start a local web server, e.g. with Python:

```bash
git clone https://github.com/rstockm/Metroviz.git
cd MetroViz
python3 -m http.server 8000
```

Then open `http://localhost:8000` in your browser.
