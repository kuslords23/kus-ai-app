"use client";

import { useCallback, useState } from "react";

interface AppleAccountState {
  sheetOpen: boolean;
  openSheet: () => void;
  closeSheet: () => void;
  toggleSheet: () => void;
}

/**
 * Lightweight state hook for the Apple Account sheet.
 * Use this in any parent component that needs to trigger the sheet.
 */
export function useAppleAccountSheet(): AppleAccountState {
  const [sheetOpen, setSheetOpen] = useState(false);
  const openSheet = useCallback(() => setSheetOpen(true), []);
  const closeSheet = useCallback(() => setSheetOpen(false), []);
  const toggleSheet = useCallback(() => setSheetOpen((v) => !v), []);
  return { sheetOpen, openSheet, closeSheet, toggleSheet };
}