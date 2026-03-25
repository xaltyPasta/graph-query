import React, { useState } from "react";
import { executeQuery, QueryResponse } from "../lib/api";
import { Loader2 } from "lucide-react";

interface Message {
  role: "user" | "bot";
  content: string;
}

interface ChatPanelProps {
  onHighlight: (nodes: string[], edges: Array<{ source: string; target: string }>) => void;
}

export function ChatPanel({ onHighlight }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    { role: "bot", content: "Hi! I can help you analyze the Order to Cash process." }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const query = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: query }]);
    setLoading(true);

    try {
      const result = await executeQuery(query);
      onHighlight(result.highlightNodes || [], result.highlightEdges || []);
      setMessages((prev) => [...prev, { role: "bot", content: result.answer || "Query completed with no answer." }]);
    } catch (err) {
      setMessages((prev) => [...prev, { role: "bot", content: "Error: " + (err as Error).message }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-[450px] h-full bg-white border-l border-gray-200 flex flex-col z-10 shrink-0 font-sans">
      {/* Header */}
      <div className="px-6 py-5 border-b border-gray-100">
        <h2 className="text-[16px] font-bold text-gray-900 tracking-tight">Chat with Graph</h2>
        <p className="text-[13px] text-gray-500 mt-0.5">Order to Cash</p>
      </div>

      {/* Message History */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        {messages.map((msg, i) => (
          <div key={i} className={`flex flex-col w-full ${msg.role === "user" ? "items-end" : "items-start"}`}>
            {msg.role === "bot" && (
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center font-bold text-sm">
                  D
                </div>
                <div className="flex flex-col">
                  <span className="text-[14px] font-bold text-gray-900 leading-tight">Dodge AI</span>
                  <span className="text-[12px] text-gray-500 leading-tight">Graph Agent</span>
                </div>
              </div>
            )}
            {msg.role === "user" && (
              <div className="flex items-center justify-end gap-3 mb-2 w-full">
                <span className="text-[14px] font-bold text-gray-900 leading-tight">You</span>
                <div className="w-8 h-8 rounded-full bg-gray-300 text-white flex items-center justify-center overflow-hidden">
                  <svg className="w-6 h-6 text-white mt-2" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd"></path></svg>
                </div>
              </div>
            )}

            <div className={`text-[14px] leading-relaxed ${
              msg.role === "user" 
                ? "bg-[#1f1f1f] text-white px-5 py-3.5 rounded-[20px] rounded-tr-md max-w-[85%]" 
                : "text-gray-800 pr-5 py-1"
            }`}>
              {/* Bold particular words for Dodge AI style formatting */}
              {msg.role === "bot" && msg.content.includes("Order to Cash") ? (
                <span>Hi! I can help you analyze the <b>Order to Cash</b> process.</span>
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex flex-col w-full items-start">
             <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center font-bold text-sm">D</div>
                <div className="flex flex-col">
                  <span className="text-[14px] font-bold text-gray-900 leading-tight">Dodge AI</span>
                  <span className="text-[12px] text-gray-500 leading-tight">Graph Agent</span>
                </div>
             </div>
             <Loader2 className="w-5 h-5 animate-spin text-gray-400 ml-2" />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="p-5 pb-6 bg-white shrink-0 font-sans">
        <div className="border border-gray-200 rounded-[14px] overflow-hidden shadow-sm flex flex-col bg-white">
          <div className="px-4 py-2 border-b border-gray-100 bg-[#f8f9fa] flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#22c55e]"></div>
            <span className="text-[11px] font-bold text-gray-600 tracking-wide">Dodge AI is awaiting instructions</span>
          </div>
          <form onSubmit={handleSubmit} className="flex relative items-end">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Analyze anything"
              className="w-full h-[80px] p-4 text-[14px] text-gray-900 focus:outline-none resize-none bg-white placeholder:text-gray-400"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="absolute right-4 bottom-4 px-4 py-1.5 bg-gray-500 hover:bg-gray-600 text-white text-[13px] font-medium rounded-lg disabled:opacity-50 transition-colors"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
