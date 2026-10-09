# src/studio-app

Pages of the classic Prompt Studio tools (Generate, Prompt Editor, Image → Prompt, Variations,
Outpaint, ControlNet, Format, Lint, Negative, Topics, Audio, Mesh, Logo, Fantasy, Pet, Background,
Studio, the workflow editor, Plugins). Next does not route this folder, so Castcut does not serve
them; Prompt Studio's route wrappers (`npm run gen:classic`, the core package's
`prompt-studio-sync-routes`) do, with a file here overriding `src/app` at the same route.
See docs/architecture-boundaries.md.
