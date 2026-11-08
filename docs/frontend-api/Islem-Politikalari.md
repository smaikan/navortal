# İşlem bazında tekrar, sürüm ve key politikası

Bu tablo 225 somut işlemi kapsar; kaynak OpenAPI220operationdır. 33 OpenAPI operation key ister (focus altı komut açıldığında38 somut key işlemi). Diğer187operationda header tanımlı değildir. GET sayıları yazım sayısı değildir. Sınırlar, koşullu sürümler ve no-store için [entegrasyon kuralları](Entegrasyon-Kurallari.md). Replay özgün snapshotı döndürebilir; güncel state ayrıca okunur.

| HTTP işlemi | Key / üst sınır | Body sürüm alanları | Tekrar / toparlanma |
| --- | --- | --- | --- |
| `GET /api/matrix` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `GET /api/matrix/candidates` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `DELETE /api/matrix/items/{taskId}` | Tanımlı değil | — | Otomatik yazım retry yok; güncel GET |
| `POST /api/matrix/items/{taskId}` | Tanımlı değil | `version` | Otomatik yazım retry yok; güncel GET |
| `PUT /api/matrix/items/{taskId}` | Tanımlı değil | `version` | Otomatik yazım retry yok; güncel GET |
| `GET /api/account/profile` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `PUT /api/account/profile` | Tanımlı değil | `version` | Otomatik yazım retry yok; güncel GET |
| `DELETE /api/account/profile/photo` | Tanımlı değil | `version` | Otomatik yazım retry yok; güncel GET |
| `GET /api/account/profile/photo` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `PUT /api/account/profile/photo` | Tanımlı değil | `version` | Otomatik yazım retry yok; güncel GET |
| `POST /api/auth/forgot-password` | Tanımlı değil | — | Otomatik yazım retry yok; güncel GET |
| `POST /api/auth/google` | Tanımlı değil | — | Otomatik yazım retry yok; güncel GET |
| `POST /api/auth/google/link` | Tanımlı değil | — | Otomatik yazım retry yok; güncel GET |
| `POST /api/auth/login` | Tanımlı değil | — | Otomatik yazım retry yok; güncel GET |
| `POST /api/auth/logout` | Tanımlı değil | — | Otomatik yazım retry yok; güncel GET |
| `POST /api/auth/logout-all` | Tanımlı değil | — | Otomatik yazım retry yok; güncel GET |
| `GET /api/auth/me` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `POST /api/auth/register` | Tanımlı değil | — | Otomatik yazım retry yok; güncel GET |
| `POST /api/auth/reset-password` | Tanımlı değil | — | Otomatik yazım retry yok; güncel GET |
| `POST /api/auth/session/adopt` | Tanımlı değil | — | Otomatik yazım retry yok; güncel GET |
| `POST /api/auth/session/login` | Tanımlı değil | — | Otomatik yazım retry yok; güncel GET |
| `POST /api/auth/session/register` | Tanımlı değil | — | Otomatik yazım retry yok; güncel GET |
| `GET /api/preferences` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `PUT /api/preferences` | Tanımlı değil | `version` | Otomatik yazım retry yok; güncel GET |
| `GET /api/preferences/working-hours` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `GET /api/tasks` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `POST /api/tasks` | Tanımlı değil | — | Otomatik yazım retry yok; güncel GET |
| `POST /api/tasks/batch` | Zorunlu / 128 | — | Aynı payload/key; sonra güncel GET |
| `GET /api/tasks/children` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `GET /api/tasks/picker` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `POST /api/tasks/tree` | Zorunlu / 128 | — | Aynı payload/key; sonra güncel GET |
| `GET /api/tasks/{id}` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `PUT /api/tasks/{id}` | Tanımlı değil | `version` | Otomatik yazım retry yok; güncel GET |
| `GET /api/tasks/{id}/ancestors` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `POST /api/tasks/{id}/archive` | Tanımlı değil | `version` | Otomatik yazım retry yok; güncel GET |
| `PUT /api/tasks/{id}/auto-complete` | Tanımlı değil | `version` | Otomatik yazım retry yok; güncel GET |
| `POST /api/tasks/{id}/children` | Tanımlı değil | `parentVersion` | Otomatik yazım retry yok; güncel GET |
| `GET /api/tasks/{id}/classification` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `PUT /api/tasks/{id}/classification` | Tanımlı değil | `version`, `expectedPlanningVersion` | Otomatik yazım retry yok; güncel GET |
| `POST /api/tasks/{id}/delete` | Tanımlı değil | `version` | Otomatik yazım retry yok; güncel GET |
| `GET /api/tasks/{id}/dependencies` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `POST /api/tasks/{id}/dependencies` | Tanımlı değil | `version` | Otomatik yazım retry yok; güncel GET |
| `DELETE /api/tasks/{id}/dependencies/{sourceId}` | Tanımlı değil | — | Otomatik yazım retry yok; güncel GET |
| `GET /api/tasks/{id}/detail-view` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `POST /api/tasks/{id}/move` | Tanımlı değil | `version`, `parentVersion` | Otomatik yazım retry yok; güncel GET |
| `GET /api/tasks/{id}/ordering` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `POST /api/tasks/{id}/ordering` | Tanımlı değil | `version` | Otomatik yazım retry yok; güncel GET |
| `DELETE /api/tasks/{id}/ordering/{sourceId}` | Tanımlı değil | — | Otomatik yazım retry yok; güncel GET |
| `PUT /api/tasks/{id}/planned-range` | Tanımlı değil | `version` | Otomatik yazım retry yok; güncel GET |
| `GET /api/tasks/{id}/progress` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `PUT /api/tasks/{id}/required` | Tanımlı değil | `version` | Otomatik yazım retry yok; güncel GET |
| `POST /api/tasks/{id}/restore` | Tanımlı değil | `version` | Otomatik yazım retry yok; güncel GET |
| `GET /api/tasks/{id}/start-eligibility` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `POST /api/tasks/{id}/state` | Tanımlı değil | `version` | Otomatik yazım retry yok; güncel GET |
| `GET /api/tasks/{id}/subtree` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `GET /api/tasks/{id}/summary` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `GET /api/tasks/{id}/work-components` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `PUT /api/tasks/{id}/work-definition` | Tanımlı değil | `version` | Otomatik yazım retry yok; güncel GET |
| `GET /api/tasks/{id}/workload` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `GET /api/categories` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `POST /api/categories` | Tanımlı değil | — | Otomatik yazım retry yok; güncel GET |
| `GET /api/categories/{id}` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `PUT /api/categories/{id}` | Tanımlı değil | `version` | Otomatik yazım retry yok; güncel GET |
| `POST /api/categories/{id}/archive` | Tanımlı değil | `version` | Otomatik yazım retry yok; güncel GET |
| `GET /api/categories/{id}/workload` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `GET /api/pools` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `POST /api/pools` | Tanımlı değil | — | Otomatik yazım retry yok; güncel GET |
| `GET /api/pools/{id}` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `PUT /api/pools/{id}` | Tanımlı değil | `version` | Otomatik yazım retry yok; güncel GET |
| `POST /api/pools/{id}/archive` | Tanımlı değil | `version` | Otomatik yazım retry yok; güncel GET |
| `GET /api/pools/{id}/workload` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `GET /api/projects` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `POST /api/projects` | Tanımlı değil | — | Otomatik yazım retry yok; güncel GET |
| `GET /api/projects/{id}` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `PUT /api/projects/{id}` | Tanımlı değil | `version` | Otomatik yazım retry yok; güncel GET |
| `POST /api/projects/{id}/archive` | Tanımlı değil | `version` | Otomatik yazım retry yok; güncel GET |
| `GET /api/projects/{id}/workload` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `GET /api/tags` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `POST /api/tags` | Tanımlı değil | — | Otomatik yazım retry yok; güncel GET |
| `GET /api/tags/{id}` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `PUT /api/tags/{id}` | Tanımlı değil | `version` | Otomatik yazım retry yok; güncel GET |
| `POST /api/tags/{id}/archive` | Tanımlı değil | `version` | Otomatik yazım retry yok; güncel GET |
| `GET /api/tags/{id}/workload` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `GET /api/daily-plans/{date}` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `POST /api/daily-plans/{date}/entries` | Zorunlu / 128 | `expectedPlanningVersion` | Aynı payload/key; sonra güncel GET |
| `GET /api/daily-plans/{date}/glance` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `GET /api/daily-plans/{date}/items` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `POST /api/daily-plans/{date}/items` | Tanımlı değil | — | Otomatik yazım retry yok; güncel GET |
| `POST /api/daily-plans/{date}/items/move` | Tanımlı değil | — | Otomatik yazım retry yok; güncel GET |
| `GET /api/daily-plans/{date}/overview` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `GET /api/daily-plans/{date}/revisions` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `GET /api/daily-plans/{date}/signals` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `POST /api/day-items/undo` | Tanımlı değil | `expectedPlanningVersion` | Otomatik yazım retry yok; güncel GET |
| `POST /api/day-items/{id}/complete` | Tanımlı değil | `version` | Otomatik yazım retry yok; güncel GET |
| `POST /api/day-items/{id}/move` | Tanımlı değil | `version` | Otomatik yazım retry yok; güncel GET |
| `POST /api/day-items/{id}/remove` | Tanımlı değil | `version` | Otomatik yazım retry yok; güncel GET |
| `POST /api/day-items/{id}/reopen` | Tanımlı değil | `version` | Otomatik yazım retry yok; güncel GET |
| `PUT /api/day-items/{id}/time` | Tanımlı değil | `version`, `expectedPlanningVersion` | Otomatik yazım retry yok; güncel GET |
| `GET /api/plan-revisions/{id}` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `GET /api/plan-revisions/{id}/changes` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `GET /api/plan-revisions/{id}/items` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `GET /api/schedules` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `POST /api/schedules` | Zorunlu / 128 | `expectedPlanningVersion`, `dayItemVersion` | Aynı payload/key; sonra güncel GET |
| `GET /api/schedules/{id}` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `PUT /api/schedules/{id}` | Zorunlu / 128 | `version`, `expectedPlanningVersion` | Aynı payload/key; sonra güncel GET |
| `POST /api/schedules/{id}/complete` | Tanımlı değil | `version` | Otomatik yazım retry yok; güncel GET |
| `POST /api/schedules/{id}/move` | Zorunlu / 128 | `version`, `expectedPlanningVersion` | Aynı payload/key; sonra güncel GET |
| `POST /api/schedules/{id}/remove` | Zorunlu / 128 | `version`, `expectedPlanningVersion` | Aynı payload/key; sonra güncel GET |
| `POST /api/schedules/{id}/reopen` | Tanımlı değil | `version` | Otomatik yazım retry yok; güncel GET |
| `POST /api/scheduling/apply` | Zorunlu / 128 | — | Aynı payload/key; sonra güncel GET |
| `POST /api/scheduling/distribute-apply` | Zorunlu / 128 | — | Aynı payload/key; sonra güncel GET |
| `POST /api/scheduling/distribute-plan` | Zorunlu / 128 | `expectedPlanningVersion` | Aynı payload/key; sonra güncel GET |
| `POST /api/scheduling/distribute-preview` | Tanımlı değil | `expectedPlanningVersion` | Otomatik yazım retry yok; güncel GET |
| `GET /api/scheduling/distribution-proposals/{id}` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `POST /api/scheduling/plan` | Zorunlu / 128 | `expectedPlanningVersion` | Aynı payload/key; sonra güncel GET |
| `POST /api/scheduling/preview` | Tanımlı değil | `expectedPlanningVersion` | Otomatik yazım retry yok; güncel GET |
| `GET /api/scheduling/proposals/{id}` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `POST /api/scheduling/undo-multi-preview` | Tanımlı değil | `expectedPlanningVersion` | Otomatik yazım retry yok; güncel GET |
| `POST /api/scheduling/undo-preview` | Tanımlı değil | `expectedPlanningVersion` | Otomatik yazım retry yok; güncel GET |
| `GET /api/tasks/{id}/allocation` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `POST /api/work-sessions/start-now` | Zorunlu / 128 | `expectedPlanningVersion`, `expectedSessionVersion` | Aynı payload/key; sonra güncel GET |
| `GET /api/calendar` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `GET /api/calendar/days/{date}` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `POST /api/calendar/days/{date}/carry` | Zorunlu / 100 | `expectedPlanningVersion` | Aynı payload/key; sonra güncel GET |
| `POST /api/calendar/days/{date}/defer` | Zorunlu / 128 | `expectedPlanningVersion` | Aynı payload/key; sonra güncel GET |
| `POST /api/calendar/days/{date}/defer-preview` | Tanımlı değil | `expectedPlanningVersion` | Otomatik yazım retry yok; güncel GET |
| `POST /api/calendar/days/{date}/defer-tasks` | Zorunlu / 128 | `expectedPlanningVersion` | Aynı payload/key; sonra güncel GET |
| `POST /api/calendar/days/{date}/pool-batch` | Zorunlu / 128 | `expectedPlanningVersion` | Aynı payload/key; sonra güncel GET |
| `POST /api/calendar/days/{date}/tasks/{id}/pool` | Zorunlu / 128 | `version`, `expectedPlanningVersion` | Aynı payload/key; sonra güncel GET |
| `GET /api/calendar/items` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `GET /api/calendar/overview` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `GET /api/focus-presets` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `POST /api/focus-presets` | Tanımlı değil | — | Otomatik yazım retry yok; güncel GET |
| `PUT /api/focus-presets/{id}` | Tanımlı değil | `version` | Otomatik yazım retry yok; güncel GET |
| `GET /api/focus-sessions` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `POST /api/focus-sessions` | Zorunlu / 128 | `workSessionVersion` | Aynı payload/key; sonra güncel GET |
| `GET /api/focus-sessions/current` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `GET /api/focus-sessions/{id}` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `POST /api/focus-sessions/{id}/pause` | Zorunlu / 128 | `version`, `workSessionVersion` | Aynı payload/key; sonra güncel GET |
| `POST /api/focus-sessions/{id}/resume` | Zorunlu / 128 | `version`, `workSessionVersion` | Aynı payload/key; sonra güncel GET |
| `POST /api/focus-sessions/{id}/break` | Zorunlu / 128 | `version`, `workSessionVersion` | Aynı payload/key; sonra güncel GET |
| `POST /api/focus-sessions/{id}/next` | Zorunlu / 128 | `version`, `workSessionVersion` | Aynı payload/key; sonra güncel GET |
| `POST /api/focus-sessions/{id}/finish` | Zorunlu / 128 | `version`, `workSessionVersion` | Aynı payload/key; sonra güncel GET |
| `POST /api/focus-sessions/{id}/cancel` | Zorunlu / 128 | `version`, `workSessionVersion` | Aynı payload/key; sonra güncel GET |
| `GET /api/tasks/{id}/time` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `GET /api/work-sessions` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `GET /api/work-sessions/current` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `POST /api/work-sessions/manual` | Zorunlu / 128 | — | Aynı payload/key; sonra güncel GET |
| `POST /api/work-sessions/start` | Zorunlu / 128 | `scheduleVersion` | Aynı payload/key; sonra güncel GET |
| `GET /api/work-sessions/{id}` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `GET /api/work-sessions/{id}/corrections` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `POST /api/work-sessions/{id}/finish` | Tanımlı değil | `version` | Otomatik yazım retry yok; güncel GET |
| `POST /api/work-sessions/{id}/pause` | Tanımlı değil | `version` | Otomatik yazım retry yok; güncel GET |
| `POST /api/work-sessions/{id}/resume` | Tanımlı değil | `version` | Otomatik yazım retry yok; güncel GET |
| `GET /api/work-sessions/{id}/segments` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `POST /api/work-sessions/{id}/segments/{segmentId}/corrections` | Tanımlı değil | `version`, `segmentVersion` | Otomatik yazım retry yok; güncel GET |
| `POST /api/client-errors` | Tanımlı değil | — | Otomatik yazım retry yok; güncel GET |
| `GET /api/note-categories` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `POST /api/note-categories` | Tanımlı değil | — | Otomatik yazım retry yok; güncel GET |
| `PUT /api/note-categories/{id}` | Tanımlı değil | `version` | Otomatik yazım retry yok; güncel GET |
| `POST /api/note-categories/{id}/move` | Tanımlı değil | `version` | Otomatik yazım retry yok; güncel GET |
| `POST /api/note-categories/{id}/remove` | Tanımlı değil | `version` | Otomatik yazım retry yok; güncel GET |
| `POST /api/note-categories/{id}/restore` | Tanımlı değil | `version` | Otomatik yazım retry yok; güncel GET |
| `GET /api/notes` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `POST /api/notes` | Tanımlı değil | — | Otomatik yazım retry yok; güncel GET |
| `PUT /api/notes/view-modes` | Tanımlı değil | — | Otomatik yazım retry yok; güncel GET |
| `PUT /api/notes/{id}` | Tanımlı değil | `version` | Otomatik yazım retry yok; güncel GET |
| `POST /api/notes/{id}/convert` | Zorunlu / 128 | `version` | Aynı payload/key; sonra güncel GET |
| `POST /api/notes/{id}/delete` | Tanımlı değil | `version` | Otomatik yazım retry yok; güncel GET |
| `POST /api/notes/{id}/restore` | Tanımlı değil | `version` | Otomatik yazım retry yok; güncel GET |
| `GET /api/support/days/{date}` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `PUT /api/support/days/{date}` | Tanımlı değil | `version` | Otomatik yazım retry yok; güncel GET |
| `GET /api/support/days/{date}/end-preparation` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `POST /api/support/quick-start` | Zorunlu / 128 | `workSessionVersion` | Aynı payload/key; sonra güncel GET |
| `POST /api/support/rescue` | Zorunlu / 100 | `expectedPlanningVersion` | Aynı payload/key; sonra güncel GET |
| `PUT /api/tasks/{id}/energy` | Tanımlı değil | `version` | Otomatik yazım retry yok; güncel GET |
| `GET /api/tasks/{id}/return-context` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `GET /api/special-days` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `POST /api/special-days` | Zorunlu / 128 | — | Aynı payload/key; sonra güncel GET |
| `GET /api/special-days/occurrences` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `PUT /api/special-days/{id}` | Tanımlı değil | `version` | Otomatik yazım retry yok; güncel GET |
| `POST /api/special-days/{id}/delete` | Tanımlı değil | `version` | Otomatik yazım retry yok; güncel GET |
| `POST /api/special-days/{id}/restore` | Tanımlı değil | `version` | Otomatik yazım retry yok; güncel GET |
| `GET /api/recurrence-templates` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `POST /api/recurrence-templates` | Zorunlu / 128 | — | Aynı payload/key; sonra güncel GET |
| `GET /api/recurrence-templates/projection` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `GET /api/recurrence-templates/{id}` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `PUT /api/recurrence-templates/{id}` | Zorunlu / 128 | `version` | Aynı payload/key; sonra güncel GET |
| `GET /api/recurrence-templates/{id}/definitions` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `PUT /api/recurrence-templates/{id}/enabled` | Zorunlu / 128 | `version` | Aynı payload/key; sonra güncel GET |
| `POST /api/recurrence-templates/{id}/materialize` | Zorunlu / 128 | `version` | Aynı payload/key; sonra güncel GET |
| `GET /api/recurrence-templates/{id}/occurrences` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `POST /api/recurrence-templates/{id}/occurrences/{date}/cancel` | Zorunlu / 128 | `version`, `taskVersion` | Aynı payload/key; sonra güncel GET |
| `POST /api/recurrence-templates/{id}/occurrences/{date}/skip` | Zorunlu / 128 | `version`, `taskVersion` | Aynı payload/key; sonra güncel GET |
| `GET /api/tasks/{id}/recurrence` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `GET /api/jobs/outbox` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `POST /api/jobs/outbox/{id}/retry` | Tanımlı değil | `version` | Otomatik yazım retry yok; güncel GET |
| `GET /api/jobs/reminders` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `GET /api/notifications` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `GET /api/notifications/alerts` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `GET /api/notifications/preferences` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `PUT /api/notifications/preferences` | Tanımlı değil | `version` | Otomatik yazım retry yok; güncel GET |
| `GET /api/notifications/push-config` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `POST /api/notifications/read-all` | Tanımlı değil | — | Otomatik yazım retry yok; güncel GET |
| `GET /api/notifications/reminders` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `POST /api/notifications/reminders` | Zorunlu / 128 | `version` | Aynı payload/key; sonra güncel GET |
| `PUT /api/notifications/reminders/{id}` | Zorunlu / 128 | `version` | Aynı payload/key; sonra güncel GET |
| `POST /api/notifications/reminders/{id}/cancel` | Tanımlı değil | `version` | Otomatik yazım retry yok; güncel GET |
| `GET /api/notifications/subscriptions` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `POST /api/notifications/subscriptions` | Tanımlı değil | — | Otomatik yazım retry yok; güncel GET |
| `POST /api/notifications/subscriptions/{id}/remove` | Tanımlı değil | `version` | Otomatik yazım retry yok; güncel GET |
| `GET /api/notifications/{id}` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `POST /api/notifications/{id}/read` | Tanımlı değil | `version` | Otomatik yazım retry yok; güncel GET |
| `POST /api/notifications/{id}/snooze` | Tanımlı değil | `version` | Otomatik yazım retry yok; güncel GET |
| `GET /api/sync` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `GET /api/workspace/snapshot` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `GET /api/analytics/actual` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `GET /api/analytics/actual/breakdown` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `GET /api/analytics/days/{date}/review` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `GET /api/analytics/estimate-accuracy` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `GET /api/analytics/estimate-suggestion` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `GET /api/analytics/plans` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `GET /api/analytics/recurrences` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `GET /api/analytics/recurrences/{id}` | Tanımlı değil | — | Sınırlı okuma; focus gözlemi ayrı |
| `POST /api/auth/change-password` | Tanımlı değil | — | Otomatik yazım retry yok; belirsiz sonuçta yeni parolayla giriş. GET me parola değişikliğini kanıtlamaz. |
