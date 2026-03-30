# Render Deploy

## Goal

Bring up the forensic backend on Render with the smallest safe path:

1. first deploy in `FORENSIC_DEMO_MODE=true`
2. confirm `/healthz`
3. point Vercel `FORENSIC_API_URL` to the Render URL
4. only then consider `FORENSIC_DEMO_MODE=false`

## Files

- Blueprint: `/Users/jungsunghoon/cctv-monitor/forensic-api/render.yaml`
- Dockerfile: `/Users/jungsunghoon/cctv-monitor/forensic-api/Dockerfile`
- App root: `/Users/jungsunghoon/cctv-monitor/forensic-api`

## Recommended Path

1. In Render, create a new Blueprint or Web Service from the repo.
2. If Render asks for the blueprint path, use:

```text
forensic-api/render.yaml
```

3. Keep the initial env values from the blueprint.
4. Deploy and verify:

```text
GET /
GET /healthz
POST /api/analyze
POST /api/track
```

5. In Vercel, set:

```env
FORENSIC_API_URL=https://<your-render-service>.onrender.com
```

6. Redeploy the frontend.

## Notes

- The blueprint starts with `plan: free` for the lowest-friction test path.
- Free web services may sleep; if you want always-on behavior, change the plan in Render.
- Keep `FORENSIC_DEMO_MODE=true` until the API path is stable.
- Only switch to `FORENSIC_DEMO_MODE=false` when you are ready to accept heavier CPU/RAM use from OpenCV + Ultralytics.
