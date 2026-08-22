# Report Automation v18 — Safety Contract

This development extends Ghaith Web Content OS without changing the stable publishing contract.

## Automatic preparation

For each normal/new report, the resumable workflow prepares one durable stage at a time:

1. Archive the report to Google Drive.
2. Extract and score opportunities.
3. Select the strongest opportunity.
4. Generate educational/awareness content in `IN_REVIEW`.
5. Generate reviewable media assets.
6. Generate a grounded digital-product MVP draft and archive it to Drive.
7. Notify the subscribed device after each completed stage and once the preparation pipeline is complete.

## Human gates preserved

- Automatic content before `PRODUCT READY` is educational/awareness only.
- A generated product is `IN_REVIEW`, never automatically `PRODUCT READY`.
- Product approval in v18 means `APPROVED` for further development only.
- No product marketing, sales CTA, publishing handoff, ClickUp `READY`, or platform publishing happens automatically from this report-preparation workflow.
- The existing `ClickUp READY -> Make Watch Tasks -> platform` route remains untouched.

## Stability controls

- The GitHub Action advances one persisted stage per API call and can resume safely after interruption.
- A single scheduled run processes at most one report to completion and is time-boxed.
- Historical Gmail summary backfill remains isolated from this new automatic path to avoid consuming free AI/Drive quota unexpectedly.
- Stage timestamps and product/opportunity/content links are stored with the report so repeated runs skip completed work.
- Errors are recorded and pushed as notifications; the next scheduled run retries from the first incomplete stage.
