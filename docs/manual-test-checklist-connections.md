# Connection Management UI — Manual Test Checklist

Use this after deploying changes from the `connection-management` plan. Tests
should pass on a fresh `docker compose up -d` after `docker compose build --no-cache`.

## Setup

1. Ensure the container is running and you're logged in at `http://localhost:<PORT>`.
2. Have at least one saved connection (create one if the list is empty).
3. Open the browser DevTools console to observe any errors.

## Backend (sanity)

- [ ] `GET /api/connections` includes fields `description`, `color`, `group`, `favorite` for every connection (existing or new).
- [ ] `POST /api/connections` with `{"color":"red"}` → 400 `{"error":"Invalid color format"}`.
- [ ] `POST /api/connections` with description > 200 chars → 400.
- [ ] `POST /api/connections` with group > 50 chars → 400.
- [ ] `PUT /api/connections/{id}` with only `{"group":"X"}` preserves color and description (response shows old values).
- [ ] List ordering: connections with `favorite: true` appear at the top regardless of name.

## UI: List View

- [ ] Saved Connections dropdown shows a `[Manage…]` button.
- [ ] Click `[Manage…]` → the full-screen connection manager opens; all existing connections render in rows.
- [ ] Each row shows: checkbox, name, group, host, user, favorite star, color swatch, edit/delete icons.
- [ ] Favorites have a left blue accent bar.
- [ ] Search box filters live (case-insensitive across name/host/user/group/description).
- [ ] Group filter dropdown lists each distinct group plus "All groups".
- [ ] Click column headers (Name, Group, Host) to toggle sort; caret indicator updates.
- [ ] Empty state: shows "No connections yet" with a create button.

## UI: Create / Edit Modal

- [ ] Click `+ New` → modal opens, all required fields marked with `*`.
- [ ] Submit empty form → validation errors shown in red banner at top.
- [ ] Invalid color (`red`) → frontend banner says "Color must be #rrggbb".
- [ ] Valid form submission → modal closes, list updates, toast "Created" appears briefly.
- [ ] Click `✎` on a row → modal pre-filled with existing values; "Save changes" button.
- [ ] Edit + save → list reflects changes; toast "Saved" appears.
- [ ] Cancel button or click overlay closes modal without saving.

## UI: Bulk Actions

- [ ] Master checkbox in header toggles all visible rows.
- [ ] Per-row checkbox updates "Bulk (N)" button visibility/count.
- [ ] With 0 selected → Bulk button hidden.
- [ ] With ≥ 1 selected → Bulk button visible; clicking opens bulk-action modal.
- [ ] Bulk Delete: confirm prompt shows count, then deletes; toast reports success/failure counts.
- [ ] Bulk Move to group: enter group, click Move → selected connections update; toast reports.
- [ ] Bulk Set Favorite / Unfavorite: toggles star on all selected.
- [ ] Bulk Set color: enter color, click Apply → color swatch updates on all selected rows.
- [ ] If any bulk action fails (e.g., one connection deleted in another tab): toast says "Updated X, failed Y".

## Reset

After testing, optionally clear test connections via `DELETE /api/connections/{id}` or via the UI's 🗑 button.
