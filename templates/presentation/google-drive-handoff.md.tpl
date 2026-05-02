# Google Drive Handoff: <deck-title>

**Deck slug**: `<slug>`
**PPTX path**: `.supervibe/artifacts/presentations/<slug>/export/<slug>.pptx`
**Target Drive folder**: `<drive-folder-url-or-id>`
**Owner**: `<owner>`
**Upload state**: pending | uploaded | replaced
**Approved at**: `<approved-at>`

## Upload checklist

- Confirm `.approval.json` exists and status is `approved`.
- Confirm exported PPTX exists and passes smoke check.
- Upload `.supervibe/artifacts/presentations/<slug>/export/<slug>.pptx` to the target Drive folder.
- Set sharing permissions requested by the user.
- Record the final Drive URL below.

## Result

**Drive URL**: `<paste-after-upload>`

## Notes

- If a Google Drive MCP or authenticated project integration is available, use it to upload directly.
- If not available, this handoff is the source of truth for manual or external upload automation.
