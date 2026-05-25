# Backlog

Offene Polish-Items aus Code-Reviews. Reihenfolge ~ Priorität.

## Aus PR #7 Review (24.05.2026)

### 🟢 Keine Migrations-Notiz für localStorage-Keys
Die Keys `chur_events_favorites`, `chur_events_custom`, `chur_events_reviewed_social_ids` bleiben bewusst auf altem Namen (Bestandsdaten würden sonst verloren gehen). Falls je eine Umbenennung gewünscht: einmaligen Migrations-Pass beim App-Start einbauen (`getItem(alt) → setItem(neu) → removeItem(alt)`).
