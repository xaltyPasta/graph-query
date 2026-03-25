"use client";

import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { fetchGraphData, GraphData, GraphNode } from "../lib/api";
import { Loader2, RefreshCw, Maximize2, Layers } from "lucide-react";
import { NodeDetails } from "./NodeDetails";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
});

interface GraphViewProps {
  highlightNodes: string[];
  highlightEdges: Array<{ source: string; target: string }>;
}

export function GraphView({ highlightNodes, highlightEdges }: GraphViewProps) {
  const [rawData, setRawData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [clickedNeighbors, setClickedNeighbors] = useState<{ nodes: string[], edges: Array<{source: string, target: string}> }>({ nodes: [], edges: [] });
  const [isGranularView, setIsGranularView] = useState<boolean>(true);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  const data: GraphData | null = useMemo(() => {
    if (!rawData) return null;
    if (isGranularView) return rawData;
    
    const granularTypes = ["ORDER_ITEM", "DELIVERY_ITEM"];
    const fNodes = rawData.nodes.filter((n: any) => !granularTypes.includes((n.type || "").toUpperCase()));
    const validIds = new Set(fNodes.map((n: any) => n._id || n.id));
    const fEdges = rawData.edges.filter((e: any) => {
      const sId = typeof e.source === 'object' ? e.source.id || e.source._id : e.source;
      const tId = typeof e.target === 'object' ? e.target.id || e.target._id : e.target;
      return validIds.has(sId) && validIds.has(tId);
    });
    
    return { nodes: fNodes, edges: fEdges } as GraphData;
  }, [rawData, isGranularView]);

  useEffect(() => {
    if (graphRef.current) {
      setTimeout(() => {
        graphRef.current?.zoomToFit(400);
      }, 50);
    }
  }, [isExpanded]);

  const graphRef = useRef<any>(null);

  const loadGraph = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const gData = await fetchGraphData();
      
      const nodes = gData.nodes.map(n => ({...n, _id: n.id}));
      const nodeIds = new Set(nodes.map(n => n._id));
      const edges = gData.edges
        .filter(e => nodeIds.has(e.source) && nodeIds.has(e.target))
        .map(e => ({...e, source: e.source, target: e.target}));

      setRawData({ nodes, edges });
      setSelectedNode(null); 
      setClickedNeighbors({ nodes: [], edges: [] });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  useEffect(() => {
    if (graphRef.current && data && highlightNodes.length > 0) {
      setClickedNeighbors({ nodes: [], edges: [] });
      
      setTimeout(() => {
        const highlightedForceNodes = data.nodes.filter(n => highlightNodes.includes((n as any)._id || n.id));
        if (highlightedForceNodes.length > 0) {
          let sumX = 0, sumY = 0, count = 0;
          highlightedForceNodes.forEach((n: any) => {
             if (n.x && n.y) { sumX += n.x; sumY += n.y; count++; }
          });
          if (count > 0) {
             graphRef.current.centerAt(sumX/count, sumY/count, 1000);
             graphRef.current.zoom(3, 1000);
          }
        }
      }, 500);
    }
  }, [highlightNodes, data]);

  const handleNodeClick = useCallback(
    (node: any) => {
      setSelectedNode(node as GraphNode);
      if (graphRef.current) {
         graphRef.current.centerAt(node.x, node.y, 1000);
         graphRef.current.zoom(4, 1000);
      }
      
      if (data) {
        const nId = node._id || node.id;
        const neighborEdges = data.edges.filter((e: any) => {
          const s = typeof e.source === 'object' ? e.source.id || e.source._id : e.source;
          const t = typeof e.target === 'object' ? e.target.id || e.target._id : e.target;
          return s === nId || t === nId;
        });
        const neighborNodes = new Set<string>([nId]);
        neighborEdges.forEach((e: any) => {
          const s = typeof e.source === 'object' ? e.source.id || e.source._id : e.source;
          const t = typeof e.target === 'object' ? e.target.id || e.target._id : e.target;
          neighborNodes.add(s);
          neighborNodes.add(t);
        });
        setClickedNeighbors({
          nodes: Array.from(neighborNodes),
          edges: neighborEdges.map((e: any) => ({
             source: typeof e.source === 'object' ? e.source.id || e.source._id : e.source,
             target: typeof e.target === 'object' ? e.target.id || e.target._id : e.target
          }))
        });
      }
    },
    [data]
  );

  const isHighlightedNode = (node: any) => {
    const id = node._id || node.id;
    return highlightNodes.includes(id) || clickedNeighbors.nodes.includes(id);
  };
  
  const isHighlightedEdge = (link: any) => {
    const sId = typeof link.source === 'object' ? link.source.id || link.source._id : link.source;
    const tId = typeof link.target === 'object' ? link.target.id || link.target._id : link.target;
    return highlightEdges.some(he => he.source === sId && he.target === tId) ||
           clickedNeighbors.edges.some(ce => ce.source === sId && ce.target === tId);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full bg-white text-gray-500">
        <Loader2 className="w-10 h-10 animate-spin mb-4 text-blue-500" />
        <p className="font-medium animate-pulse">Loading graph map...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full bg-white p-8">
        <div className="bg-red-50 text-red-600 p-6 rounded-xl shadow-sm border border-red-100 flex flex-col items-center max-w-lg text-center">
          <p className="font-bold text-[15px] mb-2">Failed to load graph</p>
          <p className="text-[13px] opacity-80 mb-6">{error}</p>
          <button onClick={loadGraph} className="flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition text-[13px]">
            <RefreshCw className="w-4 h-4 mr-2" /> Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!data || data.nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full bg-white">
        <p className="text-gray-500 text-[14px]">No nodes found.</p>
        <button onClick={loadGraph} className="mt-4 flex items-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition text-[13px]">
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </button>
      </div>
    );
  }

  const isHighlightMode = highlightNodes.length > 0 || clickedNeighbors.nodes.length > 0;

  return (
    <div className={`bg-white font-sans ${isExpanded ? 'fixed inset-0 z-50 w-screen h-screen' : 'flex w-full h-full overflow-hidden relative'}`}>
      <div className="flex-1 relative w-full h-full">
        <div className="absolute top-4 left-4 z-10 flex gap-2">
           <button onClick={() => setIsExpanded(!isExpanded)} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 transition-colors text-[12px] font-medium text-gray-700">
             <Maximize2 className="w-3.5 h-3.5" />
             {isExpanded ? "Minimize" : "Maximize"}
           </button>
           <button onClick={() => setIsGranularView(!isGranularView)} className="flex items-center gap-2 px-3 py-1.5 bg-black text-white rounded-lg shadow-sm hover:bg-gray-900 transition-colors text-[12px] font-medium">
             <Layers className="w-3.5 h-3.5" />
             {isGranularView ? "Hide Granular Overlay" : "Show Granular Overlay"}
           </button>
        </div>

        <div className="absolute inset-0 z-0">
          <ForceGraph2D
            ref={graphRef}
            graphData={{ nodes: data.nodes, links: data.edges } as any}
            nodeId="_id"
            d3AlphaDecay={0.02}
            d3VelocityDecay={0.3}
            cooldownTime={3000}
            // Thin light blue edges
            linkColor={(link: any) => {
              if (isHighlightedEdge(link)) return "#0ea5e9";
              if (isHighlightMode) return "rgba(186, 230, 253, 0.2)";
              return "rgba(186, 230, 253, 0.7)"; 
            }}
            linkWidth={(link: any) => isHighlightedEdge(link) ? 2.5 : 0.8}
            // Nodes
            nodeRelSize={3}
            nodeCanvasObject={(node: any, ctx: any, globalScale: number) => {
              const isHl = isHighlightedNode(node);
              const isSel = node._id === selectedNode?.id;
              
              const dimmed = isHighlightMode && !isHl && !isSel;
              const opacity = dimmed ? 0.2 : 1;

              ctx.beginPath();
              // Node Size
              ctx.arc(node.x, node.y, (isHl || isSel) ? 3 : 1.5, 0, 2 * Math.PI, false);
              
              const colorType = node.type.toUpperCase();
              let fillStr = "#ffffff";
              let strokeStr = "#3b82f6";

              if (colorType === "PAYMENT" || colorType === "DELIVERY" || colorType === "INVOICE") {
                fillStr = "#ef4444";
                strokeStr = "#ef4444";
              }
              
              if (isSel || isHl) {
                fillStr = "#0ea5e9";
                strokeStr = "#0f172a";
              }

              ctx.fillStyle = fillStr;
              ctx.globalAlpha = opacity;
              ctx.fill();
        
              // Outline
              ctx.lineWidth = (isHl || isSel) ? 1.5 / globalScale : 0.5 / globalScale;
              ctx.strokeStyle = strokeStr;
              ctx.stroke();

              ctx.globalAlpha = 1;
            }}
            onNodeClick={handleNodeClick}
          />
        </div>
      </div>

      <NodeDetails node={selectedNode} onClose={() => setSelectedNode(null)} />
    </div>
  );
}
