# Ferry research prototype

Ferry explores whether a read-only report can make calendar migration uncertainty clearer. This is an alpha research prototype, not a complete migration audit. It compares raw event properties and expands a deliberately small recurrence subset in a bounded window. Files stay local; the program does not transfer data.

Requires Node.js 20 or later. No dependencies or installation are needed:

```sh
node ferry.mjs examples/before.ics examples/after.ics report.json 2027-01-01 2028-01-01
node --test
```

The command creates JSON and an offline HTML rendering with exclusive file creation. Both output names must be unused; existing files are never overwritten. If either reservation fails, the newly reserved file is removed where possible. Reports can contain calendar content and should be treated as private. Input hashes identify the UTF-8 decoded content, not necessarily original file bytes. Originals are only read. The two inputs together must fit within 1 MiB, and occurrence data across both calendars is limited to 1 MiB of compact JSON. The command stops without creating reports when either limit is exceeded.

## Coverage and limitations

The window is UTC, start inclusive and end exclusive; occurrences are selected by their actual start. The occurrence audit supports UTC or IANA TZID second-resolution date-times, non-recurring events, DAILY or WEEKLY RRULE with COUNT and optional INTERVAL, EXDATE, and single moved or cancelled RECURRENCE-ID exceptions. DTSTART and DTEND are expanded in local wall time across DST. SUMMARY, DESCRIPTION and LOCATION are compared. Missing IDs and rewritten IDs require review. Unsupported event properties or components, embedded VTIMEZONE definitions, ambiguous or nonexistent local times, unsupported RRULEs, and orphan exceptions produce an unverifiable finding. Unknown calendar-level properties and non-event components are not audited. All-day and floating dates, alarms, unbounded rules, RDATE, BYDAY, UNTIL and custom time-zone definitions are unsupported. An override inherits missing text fields and duration from its master; providers may interpret partial exceptions differently. The runtime's IANA timezone database determines conversions. No expansion beyond 10,000 occurrences per series is allowed.

When a master has STATUS but an exception omits it, the series is unverifiable: Ferry does not infer the exception's effective status. [RFC 5545 section 3.8.4.4](https://www.rfc-editor.org/rfc/rfc5545#section-3.8.4.4) identifies an exception's original instance, but does not explicitly define this missing-status inheritance. The separate raw field comparison is literal, so a different time-zone representation may appear changed even when the occurrence audit recognizes the same instant. `preserved` applies only to the supported fields and bounded window; it is not proof of completeness. Two exports may share omissions. Do not delete originals based on this report.

## Comparison and open hypothesis

[FindUtils ICS Diff](https://findutils.com/convert/ics-diff/) already compares events by UID and recurrence identity and downloads reports. [Guillaume Richard's comparer](https://grichard.eu/en/tools/ics-compare/) handles regenerated IDs and UTC normalization, and flags duplicates and orphan exceptions. [Data Transfer Project](https://github.com/dtinit/data-transfer-project) supplies portability infrastructure. Ferry explores a bounded occurrence audit; no novelty or comparative superiority is claimed. The next study should run identical synthetic DST, recurrence exception, cancellation, UID rewrite and dropped-field cases through the comparison tools and record observed results. No comparative results are claimed yet.
