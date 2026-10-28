"use client";
import { useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  measurementConfig,
  type MeasurementConfig,
} from "@/lib/privacy/measurement-config";
import { createMeasurementRuntime } from "@/lib/privacy/measurement-runtime";
import { usePrivacyConsent } from "./usePrivacyConsent";

export function PrivacyMeasurement({
  config = measurementConfig,
}: {
  config?: MeasurementConfig;
}) {
  const pathname = usePathname();
  usePrivacyConsent();
  const runtime = useRef<ReturnType<typeof createMeasurementRuntime> | null>(
    null,
  );
  useLayoutEffect(() => {
    runtime.current ??= createMeasurementRuntime(config);
    runtime.current.start();
    return () => runtime.current?.stop();
  }, [config]);
  useLayoutEffect(() => {
    runtime.current?.sync();
  }, [pathname]);
  return null;
}
