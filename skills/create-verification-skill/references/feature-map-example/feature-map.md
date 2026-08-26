# Feature map: notes

## feature: create-note
- user goal: Save a titled note from the browser and confirm it from the note list
- route: /
- component: note editor
- role: button
- name: New note
- expected state: heading reads Release checklist and a Note saved status is visible
- broken state: editor stays empty and no Note saved status appears
- prerequisites: Notes is running at http://127.0.0.1:4173, disposable data directory, no note titled Release checklist
- evidence: screenshot, accessibility, cleanup

## feature: search-notes
- user goal: Find a note by title or body and open a matching result
- route: /
- component: search dialog
- role: button
- name: Search
- expected state: Search results list contains Quarterly plan
- broken state: Search results list is empty for the query quarterly
- prerequisites: Notes is running at http://127.0.0.1:4173, disposable data directory contains Quarterly plan with body Draft budget
- evidence: screenshot, accessibility, cleanup
