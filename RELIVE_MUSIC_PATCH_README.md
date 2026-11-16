# Travel Lore — Relive music implementation patch

This patch adds the initial Relive soundtrack experience.

## Included
- Six supplied MP3 tracks in `public/relive-music/`.
- Fixed in-code soundtrack catalogue; no admin UI, Firestore catalogue, or new dependency.
- Cinematic piano as the initial default soundtrack.
- Music enabled by default for newly created and existing Relive configurations.
- Persisted soundtrack selection.
- Native audio preview in Relive preparation.
- Continuous looping background playback across Relive scenes, with mute and volume controls.
- A soundtrack catalogue test and source/licensing notes.

## Apply
Keep this archive beside `apply-travel-lore-relive-music-patch.sh` in Downloads, then run:

```bash
bash ~/Downloads/apply-travel-lore-relive-music-patch.sh
```

The script requires the project to be on the inspected clean baseline commit. It makes a backup of files it will replace and does not commit, push, or deploy.

## Validation
The source files passed TypeScript/TSX syntax transpilation in the preparation environment. Full Vitest, ESLint, and Vite build checks could not be completed there because the uploaded source bundle does not contain installed project dependencies. Run the project's full checks locally after applying:

```bash
npm test
npm run lint
npm run build
```

## Important notes
- Browser autoplay policies may prevent audible autoplay until the user interacts with the soundtrack control. The player includes an Enable soundtrack fallback.
- The six MP3 files are publicly fetchable static assets in a GitHub Pages deployment. Anyone able to access the app can retrieve them.
- The uploaded AtlasAudio MP3 does not match the supplied Pixabay corporate URL ending in `487426`; the MP3 for that URL was not included. See `docs/relive-soundtrack-sources.md`.
- Verify the applicable Pixabay licence for each exact audio file before production distribution.
