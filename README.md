# Travel Lore V1

Clean rebuild foundation for Travel Lore.

## Locked V1 decisions

- Journey is the sharing/security boundary.
- Journey fields: name, place, required start date, required end date.
- Roles: owner, editor, viewer.
- Only owners manage collaborators.
- Entries belong to a Journey.
- Entry locations use Mapbox plus manual latitude/longitude entry.
- Photos are external Google Photos/Albums links; Firebase Storage is not used.
- Email/password is the initial Firebase authentication provider.

## Important

This project is intentionally not based on the corrupted legacy source project.
The legacy Firestore rules are historical evidence; the new rules must enforce Journey-level authorization.

Before running locally, copy `.env.example` to `.env.local` and supply the Firebase web configuration and Mapbox token.
