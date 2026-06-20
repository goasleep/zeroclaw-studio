export async function isPermissionGranted() {
  return true;
}

export async function requestPermission() {
  return "granted";
}

export function sendNotification(_notification: { title: string; body?: string }) {}
