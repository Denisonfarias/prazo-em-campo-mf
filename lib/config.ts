export const SHEET_ID = "1hbC22pvcUOSiu8e7zhu0e0H852RnOEt8sD6be-YGyfM";

export const SHEET_EDIT_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`;

export const SHEET_CSV_URL =
  process.env.SHEET_CSV_URL ||
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`;

export const ALERT_WINDOW_MS = 60 * 60 * 1000;

export const TIMEZONE = "America/Sao_Paulo";

/** Ceará and the rest of Brazil stay on UTC−3. */
export const SAO_PAULO_OFFSET_HOURS = 3;
