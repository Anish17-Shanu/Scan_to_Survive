import { Html5Qrcode } from "html5-qrcode";
import { useEffect, useRef, useState } from "react";

type Props = {
  onDetected: (code: string) => void;
  enabled: boolean;
};

export function ScannerPanel({ onDetected, enabled }: Props) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const detectedRef = useRef(false);
  const regionIdRef = useRef(`qr-region-${Math.random().toString(36).slice(2, 10)}`);
  const mountRunRef = useRef(0);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const runId = mountRunRef.current + 1;
    mountRunRef.current = runId;
    const stopScanner = async () => {
      const scanner = scannerRef.current;
      if (!scanner) return;
      try {
        if (scanner.isScanning) {
          await scanner.stop();
        }
      } catch {
        // ignore stop failures
      }
      try {
        await scanner.clear();
      } catch {
        // ignore clear failures
      }
      scannerRef.current = null;
      setActive(false);
    };

    if (!enabled) {
      detectedRef.current = false;
      void stopScanner();
      return;
    }

    setError(null);
    setActive(false);
    detectedRef.current = false;
    let mounted = true;

    const start = async () => {
      try {
        const region = document.getElementById(regionIdRef.current);
        if (!region) {
          throw new Error("Scanner region unavailable");
        }
        const scanner = new Html5Qrcode(regionIdRef.current);
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 6, qrbox: { width: 220, height: 220 } },
          (decodedText) => {
            if (!mounted) return;
            if (detectedRef.current) return;
            detectedRef.current = true;
            onDetected(decodedText);
            // Stop camera after first successful decode to reduce CPU load and duplicate reads.
            void stopScanner();
          },
          () => {}
        );
        if (!mounted || mountRunRef.current !== runId) {
          await stopScanner();
          return;
        }
        if (mounted) setActive(true);
      } catch {
        if (mounted) setError("Camera access failed. Check browser permission.");
      }
    };

    void start();

    return () => {
      mounted = false;
      void stopScanner();
    };
  }, [enabled, onDetected]);

  return (
    <section className="rounded-2xl border border-white/15 bg-black/20 p-4">
      <p className="mb-2 text-sm text-slate-300">
        {!enabled ? "Scanner paused" : active ? "Scanner active" : "Starting scanner..."}
      </p>
      <div id={regionIdRef.current} className="min-h-64 overflow-hidden rounded-xl border border-white/20" />
      {error && <p className="mt-2 text-sm text-rose-300">{error}</p>}
    </section>
  );
}
