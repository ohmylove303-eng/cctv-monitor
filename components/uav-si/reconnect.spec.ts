/**
 * reconnect.spec.ts — SSE 재연결 E2E 테스트 (Playwright)
 * ========================================================
 * 시나리오:
 *   1. 로그인 → SSE 연결
 *   2. force_disconnect 엔드포인트 호출
 *   3. 3초 대기 → 자동 재연결 확인
 *   4. QoS normal 복원 확인 (HUD 🟢)
 * 
 * 환각 방지:
 *   - Playwright waitForResponse (타임아웃 5초)
 *   - 실제 백엔드 필요 (mock 불가)
 */
import { test, expect } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5173";
const API_URL  = process.env.E2E_API_URL  || "http://localhost:8000";

test.describe("SSE Reconnect Flow", () => {
  test("should reconnect after force_disconnect", async ({ page }) => {
    // 1. 로그인
    await page.goto(BASE_URL);
    await page.fill('input[name="username"]', "demo");
    await page.fill('input[name="password"]', "demo123");
    await page.click('button[type="submit"]');

    // 2. HUD QoS normal (🟢) 대기
    await expect(page.locator('[data-testid="qos-indicator"]')).toContainText("🟢", {
      timeout: 10000,
    });

    // 3. force_disconnect 트리거
    const sessionId = await page.evaluate(() => {
      // @ts-ignore (전역 접근)
      return window.__SESSION_ID__;
    });

    const disconnectRes = await page.request.post(
      `${API_URL}/session/${sessionId}/force_disconnect`
    );
    expect(disconnectRes.ok()).toBeTruthy();

    // 4. SSE 연결 끊김 → 3초 대기
    await page.waitForTimeout(3000);

    // 5. 자동 재연결 확인 (SSE stream 재시작)
    const reconnectPromise = page.waitForResponse(
      (res) => res.url().includes("/telemetry/stream") && res.status() === 200,
      { timeout: 5000 }
    );
    await expect(reconnectPromise).resolves.toBeTruthy();

    // 6. QoS normal 복원 (🟢)
    await expect(page.locator('[data-testid="qos-indicator"]')).toContainText("🟢", {
      timeout: 5000,
    });
  });

  test("should handle SSE token expiration", async ({ page }) => {
    await page.goto(BASE_URL);
    await page.fill('input[name="username"]', "demo");
    await page.fill('input[name="password"]', "demo123");
    await page.click('button[type="submit"]');

    // SSE 연결 대기
    await page.waitForResponse((res) => res.url().includes("/telemetry/stream"));

    // 60초 대기 (토큰 만료) → 자동 재발급
    // 주의: 실제 60초 대기는 CI에서 비현실적 → mock 시간 필요
    // 여기서는 원리 검증만 (실제 테스트는 mock clock 사용)

    await page.waitForTimeout(65000);  // 65초 (만료 + 버퍼)

    // 재발급 후 재연결 확인
    const tokenRefreshRes = await page.waitForResponse(
      (res) => res.url().includes("/auth/sse-token"),
      { timeout: 5000 }
    );
    expect(tokenRefreshRes.ok()).toBeTruthy();

    // SSE 재연결 확인
    await expect(page.locator('[data-testid="qos-indicator"]')).toContainText("🟢");
  });
});
