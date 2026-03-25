"use client";

import { useState } from "react";
import { GraphView } from "@/components/GraphView";
import { ChatPanel } from "@/components/ChatPanel";
import { Sidebar } from "lucide-react";

export default function Home() {
  const [highlightNodes, setHighlightNodes] = useState<string[]>([]);
  const [highlightEdges, setHighlightEdges] = useState<Array<{ source: string; target: string }>>([]);

  const handleHighlight = (nodes: string[], edges: Array<{ source: string; target: string }>) => {
    setHighlightNodes(nodes);
    setHighlightEdges(edges);
  };

  return (
    <main className="w-full h-screen bg-[#f8f9fa] flex flex-col font-sans overflow-hidden">
      {/* Top Header */}
      <div className="h-14 bg-white border-b border-gray-200 flex items-center px-4 shrink-0">
        <button className="p-2 text-gray-500 hover:text-gray-900 transition-colors">
          <Sidebar className="w-5 h-5" />
        </button>
        <div className="h-4 w-px bg-gray-300 mx-3"></div>
        <div className="flex items-center text-[15px]">
          <span className="text-gray-400">Mapping</span>
          <span className="text-gray-300 mx-2">/</span>
          <span className="text-gray-900 font-semibold">Order to Cash</span>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden min-h-0 relative p-4 gap-4">
        <div className="flex-1 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm relative h-full">
          <GraphView 
            highlightNodes={highlightNodes} 
            highlightEdges={highlightEdges} 
          />
        </div>
        
        <div className="h-full rounded-xl overflow-hidden shadow-sm border border-gray-200 bg-white">
          <ChatPanel onHighlight={handleHighlight} />
        </div>
      </div>
    </main>
  );
}
