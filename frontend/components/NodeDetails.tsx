import React, { useEffect, useRef } from "react";
import { GraphNode } from "../lib/api";

interface NodeDetailsProps {
  node: GraphNode | null;
  onClose?: () => void;
}

export function NodeDetails({ node, onClose }: NodeDetailsProps) {
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        onClose?.();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  if (!node) return null;

  const formatValue = (val: any): string => {
    if (val === null || val === undefined) return "-";
    if (typeof val === "object") return JSON.stringify(val);
    if (typeof val === "boolean") return val ? "True" : "False";
    return String(val);
  };

  return (
    <div 
      ref={popupRef}
      onMouseDown={(e) => e.stopPropagation()}
      className="absolute top-1/2 left-1/2 -translate-y-1/2 ml-16 w-[320px] bg-white rounded-xl shadow-2xl border border-gray-200 p-5 z-20 font-sans pointer-events-auto"
    >
      <h3 className="text-[16px] font-bold text-gray-900 mb-4">{node.type.replace(/([A-Z])/g, " $1").trim()}</h3>
      
      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        <div className="flex gap-2">
           <span className="text-[13px] text-gray-500 min-w-[120px]">Entity:</span>
           <span className="text-[13px] text-gray-900 font-medium break-words">{node.label}</span>
        </div>
        
        {Object.entries(node.metadata || {}).map(([key, value]) => (
          <div key={key} className="flex gap-2 items-start">
            <span className="text-[13px] text-gray-500 min-w-[120px]">
              {key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, " $1")}:
            </span>
            <span className="text-[13px] text-gray-900 break-words flex-1">
              {formatValue(value)}
            </span>
          </div>
        ))}
      </div>
      <p className="text-[11px] italic text-gray-400 mt-4 border-t pt-2 pointer-events-none">
        Additional fields hidden for readability
      </p>
    </div>
  );
}
