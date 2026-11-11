# Travel Lore — People & Memory UI Work Plan

Last updated: November 10, 2026

## Decisions locked

These are product decisions, not open design questions. Implement them as written unless the user explicitly changes direction.

| Area | Decision | Required behaviour |
|---|---|---|
| Country ordering | Recent | Sort countries by the date of their most recent Memory, newest first. If two countries share the same most-recent date, sort those countries alphabetically by country name. Keep existing country provenance rules unchanged. |
| Memory People selector | Search | Provide a searchable People selector in both Add Memory and Edit Memory. Search names and aliases. Selected people appear as removable chips. |
| People Directory | Split | On desktop, show the searchable People list on the left and the selected person's profile and connected Memories on the right. |
| Dashboard person click | Popup | Clicking a person name on the dashboard opens a quick-view popup, not the full directory. The popup shows associated recent Memories and offers a route to the full profile. |
| Mobile directory | Replace | On mobile, selecting a person replaces the list with that person's profile. Provide an explicit back-to-people control. Do not squeeze the desktop split layout onto a phone. |
| Inline profile creation | Minimal | From Add Memory or Edit Memory, allow a person to be created inline with only a name. Automatically select/associate that profile with the Memory being edited. Additional profile details remain available in the People Directory. |

## Implementation sequence

1. **Country recency**
   - Derive each country's latest Memory date from its included, deduplicated Memory records.
   - Sort descending by that date; alphabetical country-name tie-break.
   - Do not infer countries from titles, addresses, or coordinates. Preserve Mapbox provenance and user-confirmed manual assignment precedence.

2. **Memory People selector**
   - Keep the selector searchable by name and aliases.
   - Support an empty directory: the user can search and create the first person without leaving the Memory form.
   - Name-only creation must use the existing `createPersonProfile` service.
   - On successful creation, add the returned profile reference to the current form's selected people immediately.
   - Keep selected people removable. Preserve existing validation and save semantics.

3. **People Directory desktop split view**
   - Keep search and Add Person controls above the workspace.
   - Use a narrow list pane and a larger profile pane.
   - Selecting a person displays their profile details and associated Memories in the detail pane.
   - Preserve create, edit, delete, association cleanup, and Memory navigation behaviour.

4. **People Directory mobile replacement view**
   - In the selected state, hide the list and toolbar and show the selected profile.
   - Provide a clear Back to People action.
   - With no selected person, show the searchable list.
   - Avoid horizontal overflow and retain accessible focus states.

5. **Dashboard person quick view**
   - A name click opens a dismissible dialog.
   - Show the name, associated Memory count, and a short list of recent linked Memories.
   - Selecting a Memory opens that Memory in its Journey.
   - A separate View full profile action opens the People Directory with that person selected.
   - Preserve the dashboard's 24-name visual preview and complete See all names list.

## Acceptance checks

- Country order is newest latest-Memory date first; alphabetical tie-break is deterministic.
- Country assignment source validation is unchanged.
- A user can search for an existing person by name or alias, select them, and remove them.
- A user with no People profiles can create a person by name from a Memory form; the new person is selected on that same Memory.
- A user can create a profile while editing a Memory and the association is retained when saving.
- Desktop directory shows list and profile simultaneously.
- Mobile directory shows either list or profile, never both at once, and has a working back action.
- Dashboard name click opens quick view; Memory links and View full profile both navigate correctly.
- Existing person deletion continues to remove only the person's associations, not the Memories themselves.
- Existing legacy `people[]` data is not removed or migrated as part of this UI work without separately verified Firestore evidence.
- Run `npm test`, `npm run lint`, and `npm run build`; review desktop and mobile browser behaviour before committing.

## Guardrails

- Reuse existing Firebase People services; do not create duplicate Firestore write paths.
- Preserve existing unrelated working-tree changes.
- Do not weaken country provenance validation.
- Do not remove legacy `people[]` data or change migration behaviour in this UI task.
- Do not commit or push as part of this work unless explicitly requested.
