"use client";

import { useCallback, useRef, useState } from "react";
import { fileToAttachment, type ChatAttachment } from "@/lib/attachments/types";
import { buildMultimodalContent } from "@/utils/fileHandler";

/**
 * Shared chat-attachment state for the Jyinx composers (agent chat panel and
 * the IDE chat). Lets the user pick local files/code, previews them inline,
 * and exposes the serialized payload to send with the prompt.
 */
export function useChatAttachments() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);

  const addFiles = useCallback(async (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    const next = await Promise.all(list.map((file) => fileToAttachment(file)));
    setAttachments((current) => [...current, ...next]);
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((current) => current.filter((a) => a.id !== id));
  }, []);

  const clearAttachments = useCallback(() => setAttachments([]), []);

  const openPicker = useCallback(() => inputRef.current?.click(), []);

  /**
   * Builds the `attachments` chunk to send to /api/jyinx/chat. Text/code
   * documents become decoded text pasted into the request; images become
   * metadata markers (the backend text gateway can't ingest image bytes).
   */
  const toPayload = useCallback(async () => {
    if (attachments.length === 0) return [];
    const payload: Array<{
      id: string;
      name: string;
      mimeType: string;
      kind: "image" | "file" | "video";
      text?: string;
    }> = [];

    for (const attachment of attachments) {
      const entry: typeof payload[number] = {
        id: attachment.id,
        name: attachment.name,
        mimeType: attachment.mimeType,
        kind: attachment.kind,
      };
      if (attachment.kind === "file" && attachment.dataUrl) {
        const content = (await buildMultimodalContent("", [
          { name: attachment.name, mimeType: attachment.mimeType, dataUrl: attachment.dataUrl },
        ])) as Array<{ type: string; text?: string }>;
        const textPart = Array.isArray(content)
          ? content.find((part) => part.type === "text" && part.text)
          : undefined;
        if (textPart?.text) entry.text = textPart.text.replace(/^\n\nAttached File/, "Attached File");
      }
      payload.push(entry);
    }
    return payload;
  }, [attachments]);

  const pickerInput = (
    <input
      ref={inputRef}
      type="file"
      multiple
      hidden
      onChange={(event) => {
        void addFiles(event.target.files);
        event.target.value = "";
      }}
    />
  );

  return {
    ts: attachments,
    addFiles,
    removeAttachment,
    clearAttachments,
    openPicker,
    toPayload,
    pickerInput,
  };
}