/**
 * App.tsx — UAV 시스템 최종 통합 (4단계 완성)
 * ==========================================
 * v3.4 통합 내역:
 *   [2] Short-lived SSE token (60초 TTL, 자동 재발급)
 *   [3] Playwright E2E 재연결 테스트
 *   [4] StreamingResponse + keepalive (sse-starlette 보류)
 *   [5] Day4 3D Terrain + FPV (QoS 자동 폴백)
 * 
 * Closed Loop 11단계 + 보안 + 3D FPV 완성
 */
import React, { useState } from "react";
import { useSSE } from "./hooks/useSSE";
import { AdaptiveViewer } from "./components/Map/AdaptiveViewer";
import { Viewer3D } from "./components/Map3D/Viewer3D";
import { useSSETokenManager } from "./utils/useSSETokenManager";
import { VirtualJoystick } from "./components/VirtualJoystick";

// ── 밀리터리 디지털 카모플라쥬 배경 패턴 (SVG base64 스타일) ──
const CAMO_PATTERN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect width='100' height='100' fill='%231a261a'/%3E%3Cpath d='M0 0h20v20H0zM40 0h20v20H40zM80 0h20v20H80zM20 20h20v20H20zM60 20h20v20H60zM0 40h20v20H0zM40 40h20v20H40zM80 40h20v20H80zM20 60h20v20H20zM60 60h20v20H60zM0 80h20v20H0zM40 80h20v20H40zM80 80h20v20H80z' fill='%232c3f2c' opacity='0.7'/%3E%3Cpath d='M10 10h20v20H10zM50 10h20v20H50zM90 10h10v20H90zM30 30h20v20H30zM70 30h20v20H70zM10 50h20v20H10zM50 50h20v20H50zM90 50h10v20H90zM30 70h20v20H30zM70 70h20v20H70z' fill='%234a5d3f' opacity='0.5'/%3E%3C/svg%3E")`;

interface SessionCtx {
  sessionId: string;
  accessToken: string;  // Bearer token (auth 용)
}

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

// ── 로그인/세션 훅 ────────────────────────────────────────────
function useSession() {
  const [ctx, setCtx] = useState<SessionCtx | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = async (username: string, password: string) => {
    setLoading(true); setError(null);
    try {
      // 1) 로그인
      const lr = await fetch(`${BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!lr.ok) throw new Error("로그인 실패");
      const { access_token } = await lr.json();

      // 2) 세션 시작
      const sr = await fetch(`${BASE_URL}/session/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${access_token}`,
        },
        body: JSON.stringify({ name: "uav-session-v34" }),
      });
      if (!sr.ok) throw new Error("세션 시작 실패");
      const { session_id } = await sr.json();

      setCtx({ sessionId: session_id, accessToken: access_token });

      // 디버깅: 전역 세션 ID 노출 (E2E 테스트용)
      (window as any).__SESSION_ID__ = session_id;

    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return { ctx, loading, error, login };
}

// ── 메인 App ──────────────────────────────────────────────────
export function App() {
  const { ctx, loading, error, login } = useSession();
  const [view3D, setView3D] = useState(false);  // 2D ↔ 3D 전환

  // [2단계] SSE 토큰 자동 재발급 (60초 TTL)
  const { sseToken, loading: tokenLoading } = useSSETokenManager({
    accessToken: ctx?.accessToken ?? "",
    baseUrl: BASE_URL,
    enabled: !!ctx,
  });

  // [기존] SSE 연결 (sseToken 사용)
  const { telemetry, connected, qosLevel } = useSSE({
    sessionId: ctx?.sessionId ?? "",
    token: sseToken ?? "",  // short-lived token
    baseUrl: BASE_URL,
  });

  // 커맨드 전송기
  const sendCommand = async (axes: { pitch?: number; roll?: number; yaw?: number; throttle?: number }) => {
    if (!ctx) return;
    try {
      await fetch(`${BASE_URL}/drone/command`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ctx.accessToken}`,
        },
        body: JSON.stringify(axes),
      });
    } catch (e) {
      console.error("명령 전송 실패", e);
    }
  };

  // 로그인 폼 (디지털 카모플라쥬 적용)
  if (!ctx) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        backgroundImage: CAMO_PATTERN,
        fontFamily: "monospace",
        color: "#d1fae5" // emerald-100
      }}>
        <div style={{
          backgroundColor: "rgba(10, 15, 10, 0.85)",
          border: "2px solid #059669",
          padding: "40px 60px",
          borderRadius: "8px",
          boxShadow: "0 0 30px rgba(5, 150, 105, 0.4)",
          textAlign: "center",
          maxWidth: "400px",
          width: "100%"
        }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🦅</div>
          <h1 style={{
            fontSize: "1.5rem",
            fontWeight: "bold",
            letterSpacing: "0.2em",
            color: "#34d399",
            marginBottom: "0.5rem"
          }}>
            TACTICAL C2 NODE
          </h1>
          <p style={{ color: "#6ee7b7", fontSize: "0.75rem", marginBottom: "2rem", letterSpacing: "0.1em" }}>
            [ CLEARANCE LEVEL 4 REQUIRED ]
          </p>

          {error && (
            <div style={{
              background: "rgba(220, 38, 38, 0.2)",
              border: "1px solid #ef4444",
              color: "#fca5a5",
              padding: "10px",
              marginBottom: "20px",
              borderRadius: "4px",
              fontSize: "0.85rem"
            }}>
              ⚠️ {error}
            </div>
          )}

          <form
            style={{ display: "flex", flexDirection: "column", gap: "15px" }}
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              login(fd.get("username") as string, fd.get("password") as string);
            }}
          >
            <input
              name="username"
              placeholder="OPERATOR ID"
              defaultValue="demo"
              style={{
                background: "rgba(0, 0, 0, 0.5)",
                border: "1px solid #10b981",
                color: "#a7f3d0",
                padding: "12px",
                outline: "none",
                fontFamily: "monospace",
                letterSpacing: "0.05em",
                borderRadius: "4px"
              }}
            />
            <input
              name="password"
              type="password"
              placeholder="PASSCODE"
              defaultValue="demo123"
              style={{
                background: "rgba(0, 0, 0, 0.5)",
                border: "1px solid #10b981",
                color: "#a7f3d0",
                padding: "12px",
                outline: "none",
                fontFamily: "monospace",
                letterSpacing: "0.05em",
                borderRadius: "4px"
              }}
            />
            <button
              type="submit"
              disabled={loading}
              style={{
                background: loading ? "#064e3b" : "#059669",
                color: "white",
                border: "none",
                padding: "14px",
                fontWeight: "bold",
                letterSpacing: "0.1em",
                cursor: loading ? "not-allowed" : "pointer",
                marginTop: "10px",
                borderRadius: "4px",
                transition: "background 0.2s"
              }}
            >
              {loading ? "AUTHENTICATING..." : "INITIATE LINK"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // 토큰 발급 대기
  if (tokenLoading || !sseToken) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#0f172a",
        color: "#38bdf8",
        fontFamily: "monospace"
      }}>
        ESTABLISHING SECURE CONNECTION...
      </div>
    );
  }

  // 메인 UI
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {/* 상단 HUD */}
      <div style={{
        padding: 16,
        background: "#1a1a1a",
        color: "white",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <div>
          <strong>UAV Control v3.4</strong> — Session: {ctx.sessionId.slice(0, 8)}
        </div>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <span data-testid="qos-indicator">
            QoS: {qosLevel === "normal" ? "🟢" : qosLevel === "medium" ? "🟡" : "🔴"} {qosLevel}
          </span>
          <span>
            {connected ? "✅ Connected" : "⚠️ Disconnected"}
          </span>
          <button onClick={() => setView3D(!view3D)}>
            {view3D ? "2D View" : "3D View"}
          </button>
        </div>
      </div>

      {/* 메인 뷰어 */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {!view3D && telemetry && (
          <AdaptiveViewer telemetry={telemetry} />
        )}

        {view3D && telemetry && (
          <Viewer3D telemetry={telemetry} />
        )}

        {/* ── 가상 조이스틱 마운트 (Manual Override) ── */}
        <div style={{
          position: "absolute",
          bottom: "30px",
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "space-between",
          padding: "0 60px",
          pointerEvents: "none",
          zIndex: 9999
        }}>
          <div style={{ pointerEvents: "auto", opacity: 0.8 }}>
            <VirtualJoystick
              label="THROTTLE / YAW"
              resetOnRelease={false}
              onChange={(normX: number, normY: number) => sendCommand({ yaw: normX, throttle: normY })}
            />
          </div>
          <div style={{ pointerEvents: "auto", opacity: 0.8 }}>
            <VirtualJoystick
              label="PITCH / ROLL"
              resetOnRelease={true}
              onChange={(normX: number, normY: number) => sendCommand({ roll: normX, pitch: normY })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
