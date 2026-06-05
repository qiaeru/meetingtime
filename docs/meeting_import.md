# Meeting templates (JSON)

The create page (`/host`) lets the host work with reusable JSON templates. The drop zone at the top of the form **imports** a template (either by clicking it to open the file dialog, or by dragging a `.json` file straight onto it; the zone highlights when a file is dragged over). The **Export as template** button next to **Create meeting** does the reverse: it saves whatever is currently typed in the form into a `.json` file named `YYYYMMDD_Meetingtime_Template.json` that can be re-imported later.

This is useful to prepare a recurring meeting, share a starting configuration between hosts, or archive a draft before clicking Create.

## Format

```json
{
  "host": {
    "firstName": "Alice",
    "lastName": "Martin",
    "role": "Product Manager"
  },
  "participants": [
    { "firstName": "Bob",   "lastName": "Durand", "role": "Dev" },
    { "firstName": "Carla", "lastName": "Lopez",  "role": "Scrum Master" }
  ],
  "topics": [
    "Sprint review",
    "Q3 roadmap",
    "Miscellaneous"
  ],
  "timeboxMinutes": 2,
  "plannedDurationMinutes": 60,
  "password": "test123"
}
```

### Fields

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `host` | identity object | No | Pre-fills the host form if present, otherwise left empty for the user to fill in. |
| `participants` | array of identities | No | Pre-declared participants. Empty or missing means none. |
| `topics` | array of strings | No | Agenda topics, in the desired order. |
| `timeboxMinutes` | positive number | No | Target duration of one speaking turn, in minutes. Whole minutes only. |
| `plannedDurationMinutes` | positive number | No | Planned total length of the meeting, in minutes. Drives the visual fill of the global timer. |
| `password` | string | No | Password required for new participants to join. Empty or omitted means an open meeting. |

### Identity structure

```json
{ "firstName": "string", "lastName": "string", "role": "string" }
```

The three fields are mandatory when the object is present.

### Validation

Any whitespace-only text field is rejected. Numeric fields must be non-negative. On error, a toast surfaces a "Invalid file: `<reason>`" message; on success, a "Import done" toast fires and every form field is populated.

### Export behaviour

Empty or unset fields are **omitted** from the output (no `null` keys). The order of participants and topics is preserved. The file is downloaded by the browser; nothing is uploaded to the server.

### Minimal example

```json
{
  "topics": ["Stand-up", "Demo", "Retro"]
}
```

### Full example

See [`docs/examples/meeting.example.json`](./examples/meeting.example.json).
