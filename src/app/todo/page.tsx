"use client";

import { useState, useRef, useEffect } from "react";
import { Check, Plus, Trash2, Circle, CheckCircle2, ClipboardList } from "lucide-react";

type Priority = "high" | "medium" | "low";

interface Todo {
  id: string;
  text: string;
  completed: boolean;
  priority: Priority;
  createdAt: number;
}

type Filter = "all" | "active" | "completed";

const PRIORITY_COLORS: Record<Priority, string> = {
  high: "bg-red-100 text-red-700 border-red-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

const PRIORITY_DOT: Record<Priority, string> = {
  high: "bg-red-500",
  medium: "bg-amber-400",
  low: "bg-emerald-500",
};

export default function TodoPage() {
  const [todos, setTodos] = useState<Todo[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(localStorage.getItem("todos") ?? "[]");
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [filter, setFilter] = useState<Filter>("all");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem("todos", JSON.stringify(todos));
  }, [todos]);

  const addTodo = () => {
    const text = input.trim();
    if (!text) return;
    setTodos((prev) => [
      {
        id: crypto.randomUUID(),
        text,
        completed: false,
        priority,
        createdAt: Date.now(),
      },
      ...prev,
    ]);
    setInput("");
    inputRef.current?.focus();
  };

  const toggle = (id: string) =>
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t))
    );

  const remove = (id: string) =>
    setTodos((prev) => prev.filter((t) => t.id !== id));

  const clearCompleted = () =>
    setTodos((prev) => prev.filter((t) => !t.completed));

  const filtered = todos.filter((t) => {
    if (filter === "active") return !t.completed;
    if (filter === "completed") return t.completed;
    return true;
  });

  const activeCount = todos.filter((t) => !t.completed).length;
  const completedCount = todos.filter((t) => t.completed).length;

  return (
    <main className="min-h-screen bg-[#F0FDFA] flex flex-col items-center px-4 py-12">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-[#0D9488] flex items-center justify-center">
          <ClipboardList className="w-5 h-5 text-white" />
        </div>
        <h1
          className="text-3xl font-bold text-[#134E4A]"
          style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
        >
          My Tasks
        </h1>
      </div>

      <div className="w-full max-w-lg">
        {/* Input */}
        <div className="bg-white rounded-2xl shadow-sm border border-teal-100 p-4 mb-4">
          <div className="flex gap-2 mb-3">
            {(["high", "medium", "low"] as Priority[]).map((p) => (
              <button
                key={p}
                onClick={() => setPriority(p)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-all duration-150 cursor-pointer ${
                  priority === p
                    ? PRIORITY_COLORS[p] + " ring-2 ring-offset-1 ring-current"
                    : "bg-gray-50 text-gray-400 border-gray-200 hover:border-gray-300"
                }`}
                aria-pressed={priority === p}
              >
                <span className={`w-2 h-2 rounded-full ${PRIORITY_DOT[p]}`} />
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTodo()}
              placeholder="Add a new task…"
              className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-[#134E4A] text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0D9488]/40 focus:border-[#0D9488] transition-colors duration-150"
              aria-label="New task input"
            />
            <button
              onClick={addTodo}
              disabled={!input.trim()}
              className="w-11 h-11 rounded-xl bg-[#0D9488] hover:bg-[#0b8579] disabled:bg-gray-200 disabled:cursor-not-allowed flex items-center justify-center transition-colors duration-150 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#0D9488]/50"
              aria-label="Add task"
            >
              <Plus className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 bg-white rounded-xl border border-teal-100 p-1 mb-4 shadow-sm">
          {(["all", "active", "completed"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all duration-150 cursor-pointer ${
                filter === f
                  ? "bg-[#0D9488] text-white shadow-sm"
                  : "text-gray-500 hover:text-[#0D9488]"
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
              {f === "active" && activeCount > 0 && (
                <span className={`ml-1.5 text-xs ${filter === f ? "opacity-80" : "text-[#0D9488]"}`}>
                  {activeCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Todo list */}
        <div className="space-y-2">
          {filtered.length === 0 && (
            <div className="flex flex-col items-center py-16 text-gray-400">
              <Check className="w-10 h-10 mb-3 opacity-40" />
              <p className="text-sm font-medium">
                {filter === "completed" ? "No completed tasks yet" : "All clear!"}
              </p>
            </div>
          )}

          {filtered.map((todo) => (
            <div
              key={todo.id}
              className={`group flex items-center gap-3 bg-white rounded-xl border px-4 py-3 shadow-sm transition-all duration-150 ${
                todo.completed
                  ? "border-gray-100 opacity-60"
                  : "border-teal-100 hover:border-[#0D9488]/30 hover:shadow-md"
              }`}
            >
              <button
                onClick={() => toggle(todo.id)}
                className="flex-shrink-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#0D9488]/40 rounded-full"
                aria-label={todo.completed ? "Mark incomplete" : "Mark complete"}
              >
                {todo.completed ? (
                  <CheckCircle2 className="w-5 h-5 text-[#0D9488]" />
                ) : (
                  <Circle className="w-5 h-5 text-gray-300 group-hover:text-[#0D9488]/50 transition-colors duration-150" />
                )}
              </button>

              <span
                className={`flex-1 text-sm font-medium transition-colors duration-150 ${
                  todo.completed ? "line-through text-gray-400" : "text-[#134E4A]"
                }`}
              >
                {todo.text}
              </span>

              <span
                className={`flex-shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${PRIORITY_COLORS[todo.priority]}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[todo.priority]}`} />
                {todo.priority}
              </span>

              <button
                onClick={() => remove(todo.id)}
                className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all duration-150 cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-300 focus:opacity-100"
                aria-label="Delete task"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>

        {/* Footer */}
        {todos.length > 0 && (
          <div className="flex items-center justify-between mt-4 px-1 text-xs text-gray-400">
            <span>
              {activeCount} task{activeCount !== 1 ? "s" : ""} remaining
            </span>
            {completedCount > 0 && (
              <button
                onClick={clearCompleted}
                className="hover:text-red-400 transition-colors duration-150 cursor-pointer"
              >
                Clear completed ({completedCount})
              </button>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
