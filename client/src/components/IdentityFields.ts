import { MAX_IDENTITY_FIELD, type ParticipantIdentity } from "@meetingtime/shared";
import { t } from "../i18n/index.js";

export interface IdentityInputs {
  fields: HTMLElement[];
  first: HTMLInputElement;
  // Trimmed, or undefined while any field is blank.
  value: () => ParticipantIdentity | undefined;
  // As typed, even when incomplete.
  raw: () => ParticipantIdentity;
  set: (identity: ParticipantIdentity) => void;
}

// First name, last name and role with visible labels (a placeholder vanishes
// on the first keystroke and leaves the field unnamed on screen). `own` is
// the user's own identity, which the browser may autofill; for someone
// else's, autofill is off so the browser never offers the user's saved name.
export function identityInputs(own: boolean): IdentityInputs {
  const first = identityInput(t("common.firstName"), own ? "given-name" : "off");
  const last = identityInput(t("common.lastName"), own ? "family-name" : "off");
  const role = identityInput(t("common.role"), own ? "organization-title" : "off");
  return {
    fields: [first.wrap, last.wrap, role.wrap],
    first: first.input,
    value: () => {
      const f = first.input.value.trim();
      const l = last.input.value.trim();
      const r = role.input.value.trim();
      if (!f || !l || !r) return undefined;
      return { firstName: f, lastName: l, role: r };
    },
    raw: () => ({
      firstName: first.input.value,
      lastName: last.input.value,
      role: role.input.value,
    }),
    set: (identity) => {
      first.input.value = identity.firstName;
      last.input.value = identity.lastName;
      role.input.value = identity.role;
    },
  };
}

export function identityFieldset(legendText: string): IdentityInputs & { el: HTMLElement } {
  const fs = document.createElement("fieldset");
  fs.className = "fieldset";
  const leg = document.createElement("legend");
  leg.className = "required";
  leg.textContent = legendText;
  const row = document.createElement("div");
  row.className = "inline-row";
  const inputs = identityInputs(true);
  row.append(...inputs.fields);
  fs.append(leg, row);
  return { ...inputs, el: fs };
}

function identityInput(
  label: string,
  autocomplete: string
): { wrap: HTMLElement; input: HTMLInputElement } {
  const wrap = document.createElement("label");
  wrap.className = "field";
  const span = document.createElement("span");
  span.textContent = label;
  const input = document.createElement("input");
  input.type = "text";
  input.required = true;
  input.maxLength = MAX_IDENTITY_FIELD;
  // setAttribute: TypeScript's AutoFill type lacks "organization-title".
  input.setAttribute("autocomplete", autocomplete);
  wrap.append(span, input);
  return { wrap, input };
}
