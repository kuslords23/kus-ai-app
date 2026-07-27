export type ChatAttachment = {
  id: string;
  kind: "image" | "file" | "video";
  name: string;
  mimeType: string;
  previewUrl?: string;
  dataUrl?: string;
  size: number;
};

export async function fileToAttachment(file: File): Promise<ChatAttachment> {
  const kind = file.type.startsWith("image/")
    ? "image"
    : file.type.startsWith("video/")
      ? "video"
      : "file";

  const dataUrl =
    kind === "image" || kind === "video"
      ? await readAsDataUrl(file)
      : undefined;

  return {
    id: crypto.randomUUID(),
    kind,
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    previewUrl: dataUrl,
    dataUrl,
    size: file.size,
  };
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function attachmentsForRag(attachments: ChatAttachment[]) {
  return attachments.map((a) => ({
    kind: a.kind,
    name: a.name,
    mimeType: a.mimeType,
    url: a.dataUrl,
    size: a.size,
  }));
}
