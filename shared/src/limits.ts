// Input caps the server enforces. The client reads the same values for its
// maxLength attributes, so a form never accepts text the server truncates.
export const MAX_IDENTITY_FIELD = 60;
export const MAX_TOPIC_LABEL = 200;
export const MAX_PASSWORD = 128;
export const MAX_TIMEBOX_MS = 60 * 60 * 1000;
