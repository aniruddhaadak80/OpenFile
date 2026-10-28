# Favorites, history & settings

OpenFile keeps a small local database in your browser so it can remember your favorite tools, what you used recently and your preferences. It is stored with **IndexedDB** (through the Dexie library) in a database named `openfile`. **Nothing is synced, uploaded or shared**, and clearing your browser's site data removes it.

## What is stored

| Table | Contents | Where you see it |
| --- | --- | --- |
| `favorites` | Tool slug and when you starred it | Star buttons, Home, All tools, History |
| `recents` | Tool slug, last used time and how many times you opened it | Home, All tools, History |
| `history` | An activity log: tool opened, file downloaded (file name and size) and when | [History](/history) |
| `settings` | Your preferences | [Settings](/settings) |

The history keeps the most recent 2,000 entries; older ones are pruned automatically. File **contents** are never stored, only the name and size of what you downloaded.

## Favorites

Click the star on a tool card (it appears on hover) or **Save** on a tool page. Favorites show at the top of the home page and on All tools, newest first.

## History

The [History](/history) page shows your activity grouped by day, with filters for *opened* and *downloaded*, a search box, your most used tools and per-entry delete. **Clear all** wipes the activity log. You can turn recording off entirely in Settings; favorites and recents keep working either way.

## Settings

| Setting | What it does |
| --- | --- |
| Theme | System, dark or light. *System* follows your operating system. |
| Motion | System, reduced or full. Reduced turns off animations and transitions across the app. |
| Default image quality | 1 to 100. Used when a tool exports JPG, WebP or AVIF without choosing its own quality, and as the starting quality for image steps in the Workspace. |
| Download file names | A pattern applied to every download. Tokens: `{name}` (original name), `{tool}` (the tool's slug), `{date}` (YYYY-MM-DD) and `{time}` (HHMMSS). The extension is always kept. Default `{name}` leaves names unchanged. |
| Record activity | Turn the History log on or off. |

Your theme and motion choices are also mirrored to `localStorage` so they apply before the page paints, with no flash of the wrong theme.

## Export and import

**Export** downloads `openfile-settings-<date>.json` containing your preferences, favorites, recents and saved Workspace recipes, plus your activity history if you tick that option. **Import** reads such a file on another browser or device and merges it in (unknown tools are skipped).

```json
{
  "app": "openfile",
  "version": 1,
  "exportedAt": "2026-10-28T12:00:00.000Z",
  "prefs": { "theme": "dark", "reducedMotion": "system", "imageQuality": 85, "outputNaming": "{name}-{date}", "historyEnabled": true },
  "favorites": ["merge-pdf", "image-compressor"],
  "recents": [{ "slug": "merge-pdf", "lastUsed": 1793174400000, "count": 4 }],
  "recipes": []
}
```

## Upgrading from v1.0

Favorites and recent tools saved by v1.0 in `localStorage` are migrated into IndexedDB automatically the first time you open v1.1.
