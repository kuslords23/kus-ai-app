import { toast } from "sonner";

export function notifyError(message: string, description?: string) {
  toast.error(message, description ? { description } : undefined);
}

export function notifyWarning(message: string, description?: string) {
  toast.warning(message, description ? { description } : undefined);
}

export function notifySuccess(message: string) {
  toast.success(message);
}

export function notifyFromUnknown(error: unknown, fallback: string) {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : fallback;
  notifyError(fallback, message !== fallback ? message : undefined);
}
