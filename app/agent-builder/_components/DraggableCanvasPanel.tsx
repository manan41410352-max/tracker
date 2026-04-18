"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { GripHorizontal, Minus } from "lucide-react";

import { Button } from "@/components/ui/button";

type Props = {
  children: ReactNode;
  defaultPosition?: {
    x: number;
    y: number;
  };
  storageKey?: string;
  title?: string;
  description?: string;
  onMinimize?: () => void;
};

function DraggableCanvasPanel({
  children,
  defaultPosition = { x: 0, y: 0 },
  storageKey,
  title = "Floating panel",
  description,
  onMinimize,
}: Props) {
  const [position, setPosition] = useState(defaultPosition);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const draggingRef = useRef(false);

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") {
      return;
    }

    try {
      const saved = window.localStorage.getItem(storageKey);
      if (!saved) {
        return;
      }

      const parsed = JSON.parse(saved) as { x?: number; y?: number };
      if (typeof parsed.x === "number" && typeof parsed.y === "number") {
        setPosition({ x: parsed.x, y: parsed.y });
      }
    } catch {
      // Ignore corrupt persisted panel positions.
    }
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(storageKey, JSON.stringify(position));
  }, [position, storageKey]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!draggingRef.current) {
        return;
      }

      const panelRect = containerRef.current?.getBoundingClientRect();
      const maxX = Math.max(window.innerWidth - (panelRect?.width || 0) - 16, 0);
      const maxY = Math.max(window.innerHeight - (panelRect?.height || 0) - 16, 0);

      setPosition({
        x: Math.min(Math.max(event.clientX - dragOffsetRef.current.x, 8), maxX),
        y: Math.min(Math.max(event.clientY - dragOffsetRef.current.y, 8), maxY),
      });
    };

    const stopDragging = () => {
      draggingRef.current = false;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopDragging);
    window.addEventListener("blur", stopDragging);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("blur", stopDragging);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="pointer-events-auto w-[320px]"
      style={{
        position: "fixed",
        left: position.x,
        top: position.y,
        zIndex: 20,
      }}
    >
      <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-xl">
        <div
          className="flex cursor-grab items-start justify-between gap-3 border-b border-border bg-background/92 px-4 py-3 backdrop-blur active:cursor-grabbing"
          onPointerDown={(event) => {
            draggingRef.current = true;
            dragOffsetRef.current = {
              x: event.clientX - position.x,
              y: event.clientY - position.y,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          style={{ touchAction: "none" }}
        >
          <div className="flex items-start gap-2">
            <GripHorizontal className="mt-0.5 size-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-semibold text-foreground">{title}</p>
              {description ? (
                <p className="text-xs leading-5 text-muted-foreground">{description}</p>
              ) : null}
            </div>
          </div>

          {onMinimize ? (
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0"
              onClick={onMinimize}
            >
              <Minus className="size-4" />
            </Button>
          ) : null}
        </div>

        <div className="p-3">{children}</div>
      </div>
    </div>
  );
}

export default DraggableCanvasPanel;
