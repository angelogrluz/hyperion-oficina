/** Set while a cloud login owns this browser. Keeps the offline Hyperion demo from leaking into a workshop account. */
export const CLOUD_SESSION_FLAG = "oficinaplan-cloud-session";
export const CLOUD_OWNER_KEY = "oficinaplan-storage-owner";
export const DEVICE_STASH_KEY = "oficinaplan-device-stash";

export function cloudBlankMode() {
  return typeof localStorage !== "undefined" && localStorage.getItem(CLOUD_SESSION_FLAG) === "1";
}
