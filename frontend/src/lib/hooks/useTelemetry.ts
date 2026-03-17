"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export type TaskStatus = "Running" | "Success" | "Failed";

export interface TelemetryPayload {
  type: "task_log";
  agent_id: number;
  agent_name: string;
  task_description: string;
  task_status: TaskStatus;
}

export interface AgentStatus {
  agentId: number;
  agentName: string;
  taskDescription: string;
  taskStatus: TaskStatus;
  lastUpdated: Date;
}

interface UseTelemetryReturn {
  agentStatus: AgentStatus | null;
  isConnected: boolean;
  error: Error | null;
  reconnect: () => void;
}

const WEBSOCKET_URL = "ws://localhost:8000/api/telemetry/live";

export function useTelemetry(): UseTelemetryReturn {
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isManualCloseRef = useRef(false);

  const connect = useCallback(() => {
    // Clean up any existing connection
    if (wsRef.current) {
      wsRef.current.close();
    }

    try {
      const ws = new WebSocket(WEBSOCKET_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setError(null);
      };

      ws.onmessage = (event) => {
        try {
          const data: TelemetryPayload = JSON.parse(event.data);
          
          if (data.type === "task_log") {
            setAgentStatus({
              agentId: data.agent_id,
              agentName: data.agent_name,
              taskDescription: data.task_description,
              taskStatus: data.task_status,
              lastUpdated: new Date(),
            });
          }
        } catch (parseError) {
          console.error("Failed to parse telemetry payload:", parseError);
        }
      };

      ws.onerror = (event) => {
        setError(new Error("WebSocket connection error"));
        setIsConnected(false);
      };

      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;

        // Auto-reconnect if not manually closed
        if (!isManualCloseRef.current) {
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, 3000);
        }
      };
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to connect"));
    }
  }, []);

  const disconnect = useCallback(() => {
    isManualCloseRef.current = true;
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const reconnect = useCallback(() => {
    isManualCloseRef.current = false;
    setError(null);
    connect();
  }, [connect]);

  useEffect(() => {
    isManualCloseRef.current = false;
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    agentStatus,
    isConnected,
    error,
    reconnect,
  };
}
