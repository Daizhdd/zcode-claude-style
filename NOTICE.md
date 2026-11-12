# NOTICE

This plugin is a port of another project's design work. Read this before
redistributing or rebranding it.

## Design source

**dsh-claude-style** — <https://github.com/Nwflower/dsh-claude-style>
Licence: MIT (code) — © Nwflower.

Ported here:

- the colour cards (canvas / surface / ink / border / accent ladder, both
  schemes, for the Claude and DeepSeek brands), taken value by value from the
  project's `docs/STYLE.md` token table;
- the radius ladder (4 / 6 / 8 / 12 / 16), the 1px-border rule, the motion
  durations, and the "display serif / sans UI / mono code" type split;
- the Deepy mascot's eight state animations (`assets/mascot/*.gif`), copied
  from that repository's `docs/gifs/`.

Nothing from the upstream runtime was copied: its client bundle targets the
DeepSeek Harness `--dsw-alias-*` token system, which ZCode does not have. The
mapping onto ZCode's Tailwind v4 `--color-*` tokens, the renderer runtime, the
mascot state probes and the CLI in this repository are original to this port.

The upstream project's own attribution notes (Sodium renderer, message
navigation) do not apply here, because none of that code is used.

## Fonts

- **Inter** — SIL Open Font License 1.1 (UI sans, variable, 134 KB)
- **Source Serif 4** — SIL Open Font License 1.1 (Latin serif; variable
  `wght 200–900` + `opsz 8–60`, latin subset, 119 KB)
- **JetBrains Mono** — SIL Open Font License 1.1 (code)
- **Noto Serif SC** — SIL Open Font License 1.1, **not bundled**. The Chinese
  serif is taken from the host by family name (`Noto Serif SC` → `Source Han
  Serif SC` → `Songti SC` → `serif`). Shipping a full CJK face would add ~25 MB
  to every injection; the system copy is already installed on this machine.

The full licence text for the bundled faces ships as `assets/fonts/OFL.txt`.

Upstream distributes copies of Anthropic's proprietary UI faces alongside these
open ones. **Those are not included here**, and must not be added: they are not
publicly licensed for redistribution.

The same holds for the `open-claude-ui` reverse-engineering project: it names
the faces (`anthropic-serif` / `anthropic-sans`) but ships **no font files**, for
exactly this reason. This port uses open equivalents instead — Source Serif 4
for Latin, Noto Serif SC for Chinese — and reuses two typographic rules
documented there: driving the optical-size axis, and compensating font weight in
the dark scheme.

## Trademarks

"Claude" and "Claude Code" are trademarks of Anthropic. "DeepSeek" is a
trademark of DeepSeek. Colour names such as "Claude card" or "DeepSeek card" in
this repository describe a look; they do not imply affiliation.
