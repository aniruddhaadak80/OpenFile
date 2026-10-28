# Contributing to OpenFile

Thanks for helping make private file tools better for everyone. Bug fixes, new tools, docs and ideas are all welcome. If you are unsure about something, open an issue and ask first.

## Quick start

1. Fork and clone, then `npm install` and `npm run dev` (http://localhost:5173).
2. Read [docs/TOOL_GUIDE.md](docs/TOOL_GUIDE.md) for the tool conventions and UI kit, and the [developer guide](https://openfile-studio.vercel.app/docs/developer) for the architecture.
3. Keep everything client-side. Pull requests that upload user files to a server will not be merged.
4. Run `npx tsc -p tsconfig.app.json --noEmit` and `npm run build` before opening a pull request. Unit tests live in `scripts/tests/`, run one with `node scripts/tests/b12/b12.test.mjs`.
5. Describe what you changed and add a screenshot or short clip for UI changes.

## Writing style

Text people see uses plain, simple words in a human tone. No em dashes and no exclamation marks. The palette is gold `#F5A524` on black with teal, cyan, emerald, sky, orange and lime. Do not use purple, violet, pink, magenta or fuchsia.

## Docs

- In-app docs live at `/docs`. Pages are Markdown in `src/pages/docs/content/`, listed in `src/pages/docs/nav.ts`. Every page has an "Edit this page on GitHub" link.
- Never type a number or a list that the code already knows (tool counts, formats, shortcuts, models). Use the placeholders and directives described in the [developer guide](https://openfile-studio.vercel.app/docs/developer#keeping-the-docs-current). `scripts/gen-docs.mjs` runs before every build.
- Repo docs: [ARCHITECTURE](docs/ARCHITECTURE.md), [TOOL_GUIDE](docs/TOOL_GUIDE.md), [AI](docs/AI.md), [PRIVACY](docs/PRIVACY.md), [TROUBLESHOOTING](docs/TROUBLESHOOTING.md), [SHORTCUTS](docs/SHORTCUTS.md), [INSTALL](docs/INSTALL.md).

## Reporting

Bug reports and tool ideas are welcome as GitHub issues. Report security problems privately through [GitHub security advisories](https://github.com/aniruddhaadak80/OpenFile/security/advisories/new).
