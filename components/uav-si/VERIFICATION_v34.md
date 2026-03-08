
╔══════════════════════════════════════════════════════════════════════╗
║  UAV v3.4 최종 검증 및 실행 계획서                                   ║
║  4단계 통합 완성 (머스크 제1원칙 검증)                               ║
╠══════════════════════════════════════════════════════════════════════╣
║  생성일: 2026-02-25 (수) 12:12 KST                                   ║
║  기반: v3.3 Closed Loop 완성 (11/11 단계)                            ║
║  추가: 4단계 통합 (보안 + 3D + E2E + keepalive)                      ║
╚══════════════════════════════════════════════════════════════════════╝

══════════════════════════════════════════════════════════════════════
1. 4단계 통합 내역 요약
══════════════════════════════════════════════════════════════════════

[2단계] Short-lived Stream Token ✅
  - 목적: SSE URL 노출 최소화 (query token → 60초 TTL)
  - 구현:
    * backend/app/sse_token.py
      · POST /auth/sse-token (JWT exp=60초)
      · verify_sse_token() 검증 함수
    * frontend/utils/useSSETokenManager.ts
      · 자동 재발급 (50초 시점, 10초 버퍼)
      · 토큰 만료 시 EventSource 재연결
  - 환각위험: 낮음 (표준 JWT pattern)
  - ROI: ★★★★★ (운영 보안 필수)

[5단계] Day4 3D Terrain + FPV ✅
  - 목적: 사용자 체험 향상 + QoS 자동 폴백
  - 구현:
    * frontend/components/Map3D/TerrainView.tsx
      · MapLibre terrain-source (Mapbox Terrain RGB)
      · QoS critical → pitch=0, terrain off
    * frontend/components/Map3D/FPVCamera.tsx
      · Three.js FPV 카메라 (UAV 1인칭 뷰)
      · QoS critical → FPV 비활성화
    * frontend/components/Map3D/Viewer3D.tsx
      · terrain ↔ fpv 모드 전환
      · QoS 경고 배너 표시
  - 환각위험: 중간 (MapLibre terrain API 실측 필요)
  - ROI: ★★★★☆ (사용자 체험)

[3단계] Playwright E2E 재연결 테스트 ✅
  - 목적: 회귀 방지 자동화
  - 구현:
    * e2e/reconnect.spec.ts
      · force_disconnect → 3초 → 재연결 확인
      · SSE 토큰 만료 → 자동 재발급 확인
      · QoS normal 복원 확인
    * playwright.config.ts
      · headless 브라우저 설정
      · 실제 백엔드 연동 (mock 불가)
  - 환각위험: 중간 (E2E 실행 환경)
  - ROI: ★★★☆☆ (회귀 방지)

[4단계] sse-starlette 결정 → StreamingResponse 유지 ✅
  - 결정: 현 시스템 유지 (StreamingResponse)
  - 이유:
    1. 동작 중 검증됨 (환각 위험 없음)
    2. sse-starlette 통합 복잡도 > 이득
    3. keepalive 간단히 추가 (30초 주기)
    4. LatestWinsQueue 통합 재작성 불필요
  - 구현:
    * backend/app/transport_sse_keepalive_patch.py
      · 30초마다 ": keepalive\n\n" 전송
      · nginx 버퍼링 차단 (X-Accel-Buffering: no)
  - 환각위험: 없음 (기존 코드 개선)
  - ROI: ★★★☆☆ (연결 안정성)

══════════════════════════════════════════════════════════════════════
2. Alternative 비교 및 선택 근거 (제1원칙)
══════════════════════════════════════════════════════════════════════

[2] Token 방식
  A. query token (v3.3)           ❌ 로그/URL 노출 취약
  B. short-lived 60초 (v3.4)      ✅ JWT exp 표준, 자동 재발급
  C. session-based token          ⚠️ 서버 상태 증가, Redis 필요

  → 선택: B (보안 + 환각위험 최소)

[3] E2E 프레임워크
  A. Playwright                   ✅ headless 안정, TS 지원
  B. Cypress                      ⚠️ iframe 제약, SSE 불안정
  C. 수동 테스트                  ❌ 회귀 방지 불가

  → 선택: A (표준 + 안정성)

[4] SSE 라이브러리
  A. StreamingResponse (v3.3)     ✅ 동작 중, 직접 제어
  B. sse-starlette                ⚠️ 재작성 필요, keepalive 자동
  C. FastAPI EventSourceResponse  ❌ 공식 미지원, 서드파티

  → 선택: A (환각 회피 + 실용성)

[5] 3D 렌더링
  A. MapLibre terrain             ✅ 공식 지원, QoS 자동 폴백
  B. Cesium.js                    ❌ 라이선스 비용, 과설계
  C. Three.js mesh 지형           ⚠️ 타일 생성 복잡, 중복

  → 선택: A (표준 + QoS 연동)

══════════════════════════════════════════════════════════════════════
3. 환각 방지 체크리스트 (Reality Check)
══════════════════════════════════════════════════════════════════════

✅ [2] SSE Token
  □ JWT 표준 (jose 라이브러리 검증됨)
  □ 60초 TTL (datetime.timedelta 정확)
  □ 자동 재발급 (setTimeout 50초)
  ⚠️ 미검증: 실제 만료 시 클라이언트 재연결 (E2E 필요)

✅ [5] 3D Terrain
  □ MapLibre terrain-source (공식 API)
  □ Mapbox Terrain RGB (무료 제공 확인됨)
  ⚠️ 미검증: terrain easeTo 저사양 디바이스 성능
  ⚠️ 미검증: QoS critical → terrain off 실제 GPU 부하 감소폭

✅ [3] Playwright E2E
  □ Playwright 설치 가능 (npm install -D @playwright/test)
  □ EventSource 재연결 감지 (waitForResponse)
  ⚠️ 미검증: CI 환경 headless 브라우저 차이
  ⚠️ 미검증: 60초 토큰 만료 테스트 (mock clock 필요)

✅ [4] keepalive 패치
  □ SSE spec 준수 (": keepalive\n\n")
  □ 30초 주기 (표준 권장사항)
  ⚠️ 미검증: nginx/프록시 버퍼링 실제 차단 확인

══════════════════════════════════════════════════════════════════════
4. 단계별 실행 계획 (Sequential Deployment)
══════════════════════════════════════════════════════════════════════

Phase 1: 백엔드 통합 (30분)
  1.1) backend/app/sse_token.py 추가
  1.2) backend/app/main.py에 router 등록
       from app.sse_token import router as sse_token_router
       app.include_router(sse_token_router)

  1.3) backend/app/transport_sse.py 수정
       - verify_sse_token() import
       - query token → sse_token으로 변경

  1.4) keepalive 패치 적용 (transport_sse.py)
       - event_gen() 함수 내 keepalive 로직 추가

  1.5) 백엔드 테스트
       PYTHONPATH=backend pytest backend/tests/ -q
       기대: 8 passed (sse_token 테스트 1개 추가)

Phase 2: 프론트엔드 통합 (40분)
  2.1) frontend/src/utils/useSSETokenManager.ts 추가

  2.2) frontend/src/hooks/useSSE.ts 수정
       - useSSETokenManager 통합
       - sseToken deps 추가

  2.3) frontend/src/components/Map3D/ 추가
       - TerrainView.tsx
       - FPVCamera.tsx
       - Viewer3D.tsx

  2.4) frontend/src/App.tsx 교체 (최종 통합)

  2.5) 의존성 설치
       npm install @react-three/fiber @react-three/drei three

  2.6) 프론트 테스트
       npx vitest run src/tests/sseStore.test.ts
       기대: 6 passed

Phase 3: E2E 테스트 설정 (20분)
  3.1) playwright.config.ts 추가
  3.2) e2e/reconnect.spec.ts 추가
  3.3) Playwright 설치
       npm install -D @playwright/test
       npx playwright install chromium

  3.4) E2E 실행 (백엔드 + 프론트 실행 중)
       npx playwright test
       기대: 2 passed

Phase 4: 통합 검증 (30분)
  4.1) 백엔드 실행
       uvicorn app.main:app --reload --port 8000

  4.2) 프론트 실행
       npm run dev (http://localhost:5173)

  4.3) 수동 검증
       - 로그인 (demo / demo123)
       - SSE 연결 확인 (Network 탭)
       - 3D View 전환 확인
       - QoS 시뮬레이션:
         python backend/scripts/load_slow_client.py \
           --clients 5 --read-delay 0.8 --duration 30
       - HUD QoS 레벨 변화 확인 (🟢 → 🟡 → 🔴)
       - 3D → 2D 자동 폴백 확인
       - 부하 해제 후 복원 확인

  4.4) E2E 재실행 (통합 후)
       npx playwright test --ui

══════════════════════════════════════════════════════════════════════
5. 완성도 평가 기준 (Definition of Done)
══════════════════════════════════════════════════════════════════════

백엔드 (backend/)
  □ pytest 8 passed (sse_token 테스트 포함)
  □ SSE token 발급 API 200 OK
  □ token 만료 시 401 Unauthorized
  □ keepalive 30초 주기 전송 확인 (Network 탭)
  □ /stats 드롭률 0% (무부하)

프론트엔드 (frontend/)
  □ vitest 6 passed
  □ npm run dev 빌드 성공
  □ SSE 연결 성공 (Network → EventStream)
  □ HUD QoS 표시 정상 (🟢)
  □ 3D View 전환 버튼 동작
  □ terrain 3D 렌더링 확인

E2E (e2e/)
  □ npx playwright test 2 passed
  □ force_disconnect → 재연결 성공
  □ SSE 토큰 자동 재발급 확인 (Network)

통합 (전체)
  □ 부하 테스트 중 QoS 레벨 변화 (🟢 → 🟡 → 🔴)
  □ QoS critical → 3D off, pitch=0 자동
  □ 부하 해제 → QoS normal → 3D 복원
  □ 토큰 만료 60초 → 자동 재발급 → 재연결
  □ 5분 연속 운영 무중단

══════════════════════════════════════════════════════════════════════
6. 잠재 리스크 및 완화 전략 (Risk Mitigation)
══════════════════════════════════════════════════════════════════════

R1. MapLibre terrain 타일 로딩 실패
  증상: terrain-source 404 에러
  원인: Mapbox access token 미설정
  완화: TerrainView.tsx에 실제 토큰 주입 필요
        (무료: https://account.mapbox.com)

R2. Three.js FPV 렌더 충돌
  증상: MapLibre + Three.js 동시 렌더 시 화면 깜빡임
  원인: Canvas z-index 충돌
  완화: FPVCamera.tsx pointerEvents="none" 적용됨
        (필요 시 z-index 조정)

R3. SSE 토큰 만료 재연결 실패
  증상: 60초 후 EventSource 끊김, 재연결 안 됨
  원인: useSSETokenManager refresh 타이밍 오류
  완화: useEffect deps 확인 (sseToken 포함)
        디버깅: console.log 토큰 재발급 시점

R4. Playwright E2E 타임아웃
  증상: waitForResponse 5초 초과
  원인: 백엔드 미실행 or 포트 충돌
  완화: webServer 설정 확인 (playwright.config.ts)
        수동 실행: npm run dev & (백그라운드)

R5. keepalive 미전송
  증상: 60초 후 연결 끊김 (프록시 타임아웃)
  원인: event_gen() 로직 오류
  완화: Network 탭 확인 (": keepalive" 메시지)
        nginx X-Accel-Buffering 헤더 확인

══════════════════════════════════════════════════════════════════════
7. 다음 회차 추천 항목 (Future Work)
══════════════════════════════════════════════════════════════════════

[우선순위 1] Production 배포 준비
  - Docker Compose (backend + frontend + nginx)
  - 환경변수 관리 (.env.production)
  - HTTPS/WSS (Let's Encrypt)
  - 로그 집계 (ELK/CloudWatch)

[우선순위 2] 성능 최적화
  - React.memo (AdaptiveViewer, Viewer3D)
  - Three.js LOD (Level of Detail)
  - MapLibre tile caching
  - SSE 압축 (gzip)

[우선순위 3] 사용자 피드백
  - QoS 레벨 수동 고정 옵션 (자동 폴백 비활성화)
  - FPV 녹화 기능 (MediaRecorder API)
  - 텔레메트리 히스토리 재생 (타임라인 슬라이더)

══════════════════════════════════════════════════════════════════════
8. 머스크 원칙 적용 검증 (First Principles Check)
══════════════════════════════════════════════════════════════════════

원칙 1: 가장 빠른 피드백 루프
  ✅ SSE 10Hz → 100ms 레이턴시 (v3.3)
  ✅ QoS hint 즉시 반영 (v3.3)
  ✅ 토큰 50초 재발급 (v3.4) — 만료 전 갱신

원칙 2: 단일 실패 지점 제거
  ✅ 토큰 만료 → 자동 재발급 (SPOF 제거)
  ✅ SSE 끊김 → 3초 재연결 (v3.3)
  ✅ QoS 부하 → 자동 강등 (v3.3)

원칙 3: 측정 가능한 지표
  ✅ /stats 드롭률, 큐 충만도 (v3.3)
  ✅ HUD QoS 레벨 실시간 표시 (v3.3)
  ✅ E2E 테스트 pass/fail (v3.4)

원칙 4: 자가 회복 시스템
  ✅ QoS critical → 2D 폴백 (v3.3)
  ✅ 부하 해제 → 3D 복원 (v3.4)
  ✅ 토큰 만료 → 재발급 → 재연결 (v3.4)

══════════════════════════════════════════════════════════════════════
9. 최종 결론 (Executive Summary)
══════════════════════════════════════════════════════════════════════

현황:
  - v3.3 Closed Loop 완성 (11/11 단계) ✅
  - v3.4 4단계 통합 설계 완료 ✅
    [2] Short-lived token (보안)
    [5] 3D Terrain + FPV (사용자 체험)
    [3] Playwright E2E (회귀 방지)
    [4] keepalive 패치 (연결 안정)

환각 방지:
  - 표준 기술 스택 (JWT, MapLibre, Playwright)
  - 미사용 라이브러리 회피 (sse-starlette 보류)
  - 실측 필요 항목 명시 (terrain 성능, E2E CI)

완벽성:
  - Alternative 비교 완료 (A/B/C 선택 근거)
  - 리스크 식별 + 완화 전략 수립
  - 단계별 검증 기준 정의 (DoD)

다음 단계:
  1. Phase 1~4 순차 실행 (2시간 예상)
  2. 통합 검증 (DoD 체크리스트)
  3. Production 배포 준비 (다음 회차)

══════════════════════════════════════════════════════════════════════

생성일: 2026-02-25 (수) 12:12 KST
작성자: AI Assistant (머스크 사고 + 제1원칙 적용)
버전:   UAV v3.4 Final
