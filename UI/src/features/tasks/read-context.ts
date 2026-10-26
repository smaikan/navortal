"use client";
import { createContext, useContext } from "react";
import type { components } from "../../lib/api/generated/schema";
type View = components["schemas"]["TaskDetailView"];
export const TaskReadContext = createContext<{ view: View; refresh: () => Promise<View> } | null>(null);
export const useTaskRead = () => useContext(TaskReadContext);
