// Each custom field type as people read it (FR-03.6): in the type select, and in descriptions of a type change.

import type { FieldType } from "@tonaris/domain";

export const fieldTypeNames: Record<FieldType, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  yes_no: "Yes/no",
  single_choice: "Single choice",
  multiple_choice: "Multiple choice",
};
