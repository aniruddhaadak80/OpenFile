# Formats supported

Which formats can OpenFile read, and what can it turn them into? This page answers that from the tool registry itself, so it grows on its own as tools are added. Today the tools know **{{FORMAT_COUNT}} formats**.

Pick a category or type a format. Click an output to see exactly which tools do that conversion.

::component formats-matrix

## How formats are worked out

Each tool can declare its inputs and outputs in the registry. When it does not, OpenFile looks for known format names in the tool's name, description and tags, then falls back to sensible defaults for its category. The same logic powers the format filter on [All tools](/tools) and the **Drop anything** suggestions, so what you see here is what the app uses.

> [!TIP]
> Have a file and no idea what to do with it? Drag it onto any page, or use the [Open page](/open). OpenFile detects the real format from the file's bytes and lists the tools for it.
