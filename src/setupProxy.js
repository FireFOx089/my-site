/**
 * CRA dev-server proxy middleware (src/setupProxy.js)
 * Exposes POST /api/save-to-source — used by the Admin Panel's
 * "Save to File" button to permanently persist data into portfolioData.js.
 *
 * ONLY loaded by the react-scripts dev server, never in production.
 */

const path = require('path');
const fs   = require('fs');

const DATA_FILE = path.resolve(__dirname, 'portfolioData.js');

/**
 * Replaces an exported const array block in a JS source file.
 * Uses bracket-depth counting so deeply-nested JSON never confuses it.
 */
function replaceExportedArray(source, constName, replacement) {
  const marker = `export const ${constName}`;
  const start  = source.indexOf(marker);
  if (start === -1) return null;

  // Find the opening '['
  let i = start + marker.length;
  while (i < source.length && source[i] !== '[') i++;
  if (i >= source.length) return null;

  // Walk forward, counting bracket depth
  let depth = 0;
  let end   = i;
  while (end < source.length) {
    const ch = source[end];
    if (ch === '[' || ch === '{') depth++;
    else if (ch === ']' || ch === '}') {
      depth--;
      if (depth === 0) { end++; break; }
    }
    end++;
  }

  // Consume a trailing ';' if present
  if (source[end] === ';') end++;

  return source.slice(0, start) + replacement + source.slice(end);
}

module.exports = function (app) {
  app.post('/api/save-to-source', (req, res) => {
    // Manually collect the raw body — avoids express.json() issues
    // with CRA's internal webpack-dev-server Express instance.
    let rawBody = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => { rawBody += chunk; });
    req.on('end', () => {
      try {
        const { items, filters } = JSON.parse(rawBody);

        if (!Array.isArray(items) || !Array.isArray(filters)) {
          res.status(400).json({ ok: false, error: 'Invalid payload — items and filters must be arrays.' });
          return;
        }

        let content = fs.readFileSync(DATA_FILE, 'utf8');

        const filtersBlock = `export const DEFAULT_FILTERS = ${JSON.stringify(filters, null, 2)};`;
        const itemsBlock   = `export const DEFAULT_PORTFOLIO_ITEMS = ${JSON.stringify(items, null, 2)};`;

        content = replaceExportedArray(content, 'DEFAULT_FILTERS', filtersBlock);
        if (!content) {
          res.status(500).json({ ok: false, error: 'Could not locate DEFAULT_FILTERS in portfolioData.js.' });
          return;
        }

        content = replaceExportedArray(content, 'DEFAULT_PORTFOLIO_ITEMS', itemsBlock);
        if (!content) {
          res.status(500).json({ ok: false, error: 'Could not locate DEFAULT_PORTFOLIO_ITEMS in portfolioData.js.' });
          return;
        }

        fs.writeFileSync(DATA_FILE, content, 'utf8');
        console.log('[Admin Panel] portfolioData.js updated successfully.');
        res.json({ ok: true, message: 'portfolioData.js updated successfully.' });

      } catch (err) {
        console.error('[save-to-source] Error:', err);
        res.status(500).json({ ok: false, error: err.message });
      }
    });
  });
};
