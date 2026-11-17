## ADDED Requirements

### Requirement: The sync indicator is the Activity row
The sidebar's sync indicator SHALL read "Activity" with its icon, and show its state at the right only when there is one: saving, the changes waiting or needing review, or else the reports open in Activity as a count (DS-81, TON-291). Reconnecting and offline SHALL take over the row. Its accessible name SHALL start with "Activity".

#### Scenario: Up to date
- **WHEN** an owner's changes are all saved and no report is open
- **THEN** the row reads "Activity" alone, and its accessible name is "Activity: Up to date"

#### Scenario: Reports left open
- **WHEN** an owner's changes are all saved and Activity holds 3 reports
- **THEN** the row shows 3 at its right, and its accessible name is "Activity: Up to date, 3 reports"

#### Scenario: Offline
- **WHEN** the browser loses its network
- **THEN** the row reads "Offline — changes can't be saved" instead of "Activity"
