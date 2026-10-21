# Frost-based winter-treatment reminder

`winterTreatment.js` adds an independent, default-enabled recommendation under
the Tracht settings. Its boolean preference is stored as `beelotWinterTreatment`;
existing user plant rows and GTS thresholds are not migrated or changed.
Each plot execution captures the preference and owns its location cache and
reminder. Stale responses cannot update another location's information section.

The first three consecutive daily minima strictly below 0 °C must fall entirely
within November 1 through December 15. Daily 2 m minima are a proxy for frosty
nights, not an hourly nighttime measurement. Only completed local calendar days
through the selected origin are eligible; today's unfinished day and future
weather values never establish a frost sequence. A warm, missing, or invalid
minimum breaks a sequence. Missing required weather coverage produces a status
message instead of a recommendation.

The reminder date is 21 calendar days after the first day of that sequence.
It appears as soon as the three completed frost days establish the date,
independently of the GTS preview horizon and plot prediction toggle, and remains
visible for seven days after its due date. No GTS forecast settings are passed
to the frost detector or loader. Calendar arithmetic handles
year boundaries, including January reminders from the preceding frost season.
Later frost sequences do not create repeated reminders. No qualifying sequence
means no treatment recommendation.

The data service accepts an optional whitelisted daily variable, preserving
`temperature_2m_mean` and its existing cache keys as the default. Minima use
`historical_min_*` and `recent_min_*` in the same location-owned weather store.
This preserves existing mean-only caches and GTS calculations. Historical
minimum years are cached in full; provisional current-year and recent data use
the same six-hour and one-hour expiration policies as means. The shared weather
merge validates complete coverage and repairs recent archive gaps without
overwriting valid archive values.

The reminder uses the existing information table and recommendation styling,
including relative dates and compact mobile date labels. Its GTS cell contains
a dash because this rule uses frost. The concise label states the brood-free
condition and links directly to the expanded winter-treatment answer in the
FAQ. That answer explains the scheduling heuristic, the need to verify brood
freedom at the colony, and following the authorized product's instructions.
