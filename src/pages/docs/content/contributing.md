# Contributing

Thanks for helping make private file tools better for everyone. Bug fixes, new tools, docs and ideas are all welcome. If you have a question, open an issue and ask.

## The short version

1. Fork and clone, then `npm install` and `npm run dev`.
2. Keep everything client-side. A pull request that uploads user files to a server will not be merged.
3. Use the UI kit and follow the writing style below.
4. Run `npx tsc -p tsconfig.app.json --noEmit` and `npm run build` before you open the pull request.
5. Describe what changed and add a screenshot or short clip for UI changes.

## Writing style

Text people see in the app and the docs uses plain, simple words in a human tone. No em dashes and no exclamation marks: use commas, periods, colons or parentheses instead. The palette is gold `#F5A524` on black with teal, cyan, emerald, sky, orange and lime. Do not use purple, violet, pink, magenta or fuchsia.

## Editing these docs

- Each page has an **Edit this page on GitHub** link at the bottom.
- Pages are Markdown files in `src/pages/docs/content/`, listed in `src/pages/docs/nav.ts`.
- Write `{{=TOOL_COUNT}}` style placeholders and `::` directives for anything that counts or lists things, so it stays correct. See the [developer guide](/docs/developer#keeping-the-docs-current).

::include legacy:contributing#Set up,Project structure,Ground rules,Adding a tool,Reporting bugs
