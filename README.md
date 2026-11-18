# Ferry

Ferry compares two local `.ics` exports before and after a calendar migration. It reports changes in event properties and compares supported occurrences within a date window. It reads the exports in place and writes JSON and offline HTML reports on your computer.

Requires Node.js 20 or later. The command runs directly from the source folder using Node's built-in modules. Try the included fictional exports first.

```sh
node ferry.mjs examples/before.ics examples/after.ics report.json 2027-01-01 2028-01-01
node --test
```

Open `report.json.html` to see the report. The sample identifies a description that disappeared after migration. For your own exports, replace the two example paths, choose an unused JSON output name and supply the UTC start and exclusive end dates as `YYYY-MM-DD`. Each input needs complete `VCALENDAR` framing. Ferry recognizes case-insensitive component markers. A well-framed calendar with zero `VEVENT` components has an event count of zero. Text files and malformed component boundaries fail before output creation. [iCalendar specification](https://www.rfc-editor.org/rfc/rfc5545#section-3.1)

Ferry reserves both output names before writing and removes a new reservation if the other name is unavailable, where possible. Reports can contain calendar content and should be treated as private. Input hashes identify the UTF-8 decoded content. The two inputs together must fit within 1 MiB, and occurrence data across both calendars is limited to 1 MiB of compact JSON. Exceeding either limit stops report creation.

## Coverage and limitations

The window is UTC, start inclusive and end exclusive; occurrences are selected by their actual start. The occurrence audit supports UTC or IANA TZID second-resolution date-times, non-recurring events, DAILY or WEEKLY RRULE with COUNT and optional INTERVAL, EXDATE, and single moved or cancelled RECURRENCE-ID exceptions. DTSTART and DTEND are expanded in local wall time across DST. SUMMARY, DESCRIPTION and LOCATION are compared. Missing IDs and rewritten IDs require review. Unsupported event properties or components, embedded VTIMEZONE definitions, ambiguous or nonexistent local times, unsupported RRULEs, and orphan exceptions produce an unverifiable finding. Unknown calendar-level properties and non-event components are not audited. All-day and floating dates, alarms, unbounded rules, RDATE, BYDAY, UNTIL and custom time-zone definitions are unsupported. An override inherits missing text fields and duration from its master; providers may interpret partial exceptions differently. The runtime's IANA timezone database determines conversions. No expansion beyond 10,000 occurrences per series is allowed.

When a master has STATUS but an exception omits it, the series is unverifiable: Ferry does not infer the exception's effective status. [RFC 5545 section 3.8.4.4](https://www.rfc-editor.org/rfc/rfc5545#section-3.8.4.4) identifies an exception's original instance, but does not explicitly define this missing-status inheritance. The separate raw field comparison is literal, so a different time-zone representation may appear changed even when the occurrence audit recognizes the same instant. `preserved` applies only to the supported fields and bounded window; it is not proof of completeness. Two exports may share omissions. Do not delete originals based on this report.

## Related tools

Cross-tool results for daylight-saving transitions, recurrence exceptions, cancellations, rewritten IDs and dropped fields remain unverified. Related projects include [FindUtils ICS Diff](https://findutils.com/convert/ics-diff/), [Guillaume Richard's calendar comparer](https://grichard.eu/en/tools/ics-compare/) and [Data Transfer Project](https://github.com/dtinit/data-transfer-project).
