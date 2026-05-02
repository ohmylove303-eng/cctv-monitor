const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DEFAULT_REPORT = path.join(DATA_DIR, 'cctv-vision-calibration-sample-report.json');
const OUTPUT_MD = path.join(DATA_DIR, 'cctv-vision-line-zone-review.md');

function parseArgs(argv) {
    const options = {
        reportPath: DEFAULT_REPORT,
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--report') {
            options.reportPath = path.resolve(process.cwd(), argv[++index]);
        } else if (arg === '--help' || arg === '-h') {
            console.log('Usage: node scripts/build-cctv-line-zone-review-page.js [--report data/cctv-vision-calibration-sample-report.json]');
            process.exit(0);
        } else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }

    return options;
}

function htmlEscape(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function jsString(value) {
    return JSON.stringify(String(value ?? ''));
}

function buildReviewModel(report) {
    return report.samples
        .filter((sample) => sample.captureOk && Array.isArray(sample.frames) && sample.frames.length > 0)
        .map((sample) => ({
            cctvId: sample.cctvId,
            cctvName: sample.cctvName,
            region: sample.region,
            source: sample.source,
            width: sample.width,
            height: sample.height,
            suggestedReviewTier: sample.suggestedReviewTier,
            frames: sample.frames.map((frame) => ({
                file: path.basename(frame.outputPath),
                width: frame.width,
                height: frame.height,
            })),
        }));
}

const PATCH_HEADERS = [
    'reviewStatus',
    'cctvId',
    'cctvName',
    'region',
    'visionTier',
    'identificationUse',
    'approachDistanceMeters',
    'resolutionWidth',
    'resolutionHeight',
    'directionCalibrationStatus',
    'lineZoneForward',
    'lineZoneReverse',
    'evidenceSource',
    'verificationMethod',
    'sampleCount',
    'datasetPath',
    'reviewer',
    'reviewedAt',
    'notes',
];

function buildHtml(report, reviewModel) {
    const generatedAt = new Date().toISOString();
    return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CCTV Line Zone Review</title>
<style>
body { margin: 0; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #111827; color: #e5e7eb; }
main { max-width: 1280px; margin: 0 auto; padding: 20px; }
h1 { font-size: 20px; margin: 0 0 12px; }
.toolbar { display: grid; grid-template-columns: 1fr 180px 180px auto auto auto; gap: 8px; align-items: end; margin-bottom: 12px; }
.reviewFields { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; margin-bottom: 12px; }
label { display: grid; gap: 4px; font-size: 12px; color: #cbd5e1; }
input, select, button, textarea { background: #0f172a; color: #e5e7eb; border: 1px solid #334155; border-radius: 6px; padding: 8px; }
button { cursor: pointer; }
button.active { border-color: #fbbf24; color: #fef3c7; }
.canvasWrap { position: relative; width: 100%; background: #020617; border: 1px solid #334155; border-radius: 8px; overflow: auto; }
canvas { display: block; max-width: 100%; height: auto; }
.panel { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px; }
.card { border: 1px solid #334155; border-radius: 8px; padding: 12px; background: #0f172a; }
.meta { color: #94a3b8; font-size: 12px; line-height: 1.5; }
textarea { width: 100%; min-height: 120px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; box-sizing: border-box; }
.hint { color: #fbbf24; }
.buttonRow { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.gateOk { color: #86efac; }
.gateWarn { color: #fcd34d; }
.gateBad { color: #fca5a5; }
@media (max-width: 900px) {
  .toolbar, .panel, .reviewFields { grid-template-columns: 1fr; }
}
</style>
</head>
<body>
<main>
<h1>CCTV Line Zone Review</h1>
<p class="meta">Generated ${htmlEscape(generatedAt)}. This review page records pixel coordinates only. Active promotion still requires distance, reviewer, and reviewedAt evidence.</p>
<div class="toolbar">
  <label>Camera<select id="cameraSelect"></select></label>
  <label>Frame<select id="frameSelect"></select></label>
  <label>Mode<select id="modeSelect"><option value="forward">forward</option><option value="reverse">reverse</option></select></label>
  <button id="undoBtn" type="button">Undo Point</button>
  <button id="resetBtn" type="button">Reset Camera</button>
  <button id="clearStorageBtn" type="button">Clear Saved</button>
</div>
<div class="reviewFields">
  <label>Vision Tier<select id="tierSelect"><option value="">review only</option><option value="tier_a">tier_a</option><option value="tier_b">tier_b</option><option value="tier_c">tier_c</option></select></label>
  <label>Approach Distance (m)<input id="distanceInput" inputmode="numeric" placeholder="required for active"></label>
  <label>Reviewer<input id="reviewerInput" placeholder="required for active"></label>
  <label>Reviewed At<input id="reviewedAtInput" type="date"></label>
  <label>Output Status<select id="statusSelect"><option value="review_needed">review_needed</option><option value="active">active dry-run candidate</option></select></label>
</div>
<div class="canvasWrap"><canvas id="canvas"></canvas></div>
<div class="panel">
  <section class="card">
    <div class="meta" id="cameraMeta"></div>
    <p class="meta hint">Click two points for forward, then two points for reverse. Coordinates are original image pixels.</p>
  </section>
  <section class="card">
    <label>Line zone values<textarea id="output" readonly></textarea></label>
  </section>
  <section class="card">
    <label>CSV patch row<textarea id="patchOutput" readonly></textarea></label>
  </section>
  <section class="card">
    <label>All CSV patch rows<textarea id="allPatchOutput" readonly></textarea></label>
    <div class="buttonRow">
      <button id="copyAllCsvBtn" type="button">Copy All CSV</button>
      <button id="downloadAllCsvBtn" type="button">Download CSV</button>
    </div>
  </section>
  <section class="card">
    <div class="meta" id="gateSummary"></div>
  </section>
</div>
</main>
<script>
const report = {
  sampleDir: ${jsString(report.sampleDir)},
  cameras: ${JSON.stringify(reviewModel)}
};
const state = { cameraIndex: 0, frameIndex: 0, points: {}, review: {} };
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const img = new Image();
const cameraSelect = document.getElementById('cameraSelect');
const frameSelect = document.getElementById('frameSelect');
const modeSelect = document.getElementById('modeSelect');
const output = document.getElementById('output');
const patchOutput = document.getElementById('patchOutput');
const allPatchOutput = document.getElementById('allPatchOutput');
const gateSummary = document.getElementById('gateSummary');
const cameraMeta = document.getElementById('cameraMeta');
const tierSelect = document.getElementById('tierSelect');
const distanceInput = document.getElementById('distanceInput');
const reviewerInput = document.getElementById('reviewerInput');
const reviewedAtInput = document.getElementById('reviewedAtInput');
const statusSelect = document.getElementById('statusSelect');
const patchHeaders = ${JSON.stringify(PATCH_HEADERS)};
const storageKey = 'cctv-line-zone-review:' + report.sampleDir;

function keyFor(camera) { return camera.cctvId; }
function currentCamera() { return report.cameras[state.cameraIndex]; }
function currentFrame() { return currentCamera().frames[state.frameIndex]; }
function defaultReview() {
  return { tier: '', distance: '', reviewer: '', reviewedAt: '', status: 'review_needed' };
}
function cameraPoints() {
  const key = keyFor(currentCamera());
  if (!state.points[key]) state.points[key] = { forward: [], reverse: [] };
  return state.points[key];
}
function reviewFor(camera) {
  const key = keyFor(camera);
  if (!state.review[key]) state.review[key] = defaultReview();
  return state.review[key];
}
function loadSavedState() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
    if (saved && typeof saved === 'object') {
      if (saved.points && typeof saved.points === 'object') state.points = saved.points;
      if (saved.review && typeof saved.review === 'object') state.review = saved.review;
    }
  } catch (error) {
    console.warn('Saved review state could not be loaded', error);
  }
}
function saveState() {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ points: state.points, review: state.review }));
  } catch (error) {
    console.warn('Saved review state could not be written', error);
  }
}
function hydrateReviewInputs() {
  const review = reviewFor(currentCamera());
  tierSelect.value = review.tier || '';
  distanceInput.value = review.distance || '';
  reviewerInput.value = review.reviewer || '';
  reviewedAtInput.value = review.reviewedAt || '';
  statusSelect.value = review.status || 'review_needed';
}
function saveReviewInputs() {
  const review = reviewFor(currentCamera());
  review.tier = tierSelect.value;
  review.distance = distanceInput.value.trim();
  review.reviewer = reviewerInput.value.trim();
  review.reviewedAt = reviewedAtInput.value;
  review.status = statusSelect.value || 'review_needed';
  saveState();
}
function zoneValue(points) {
  return points.length === 2 ? points.map((point) => point.join(',')).join(';') : '';
}
function escapeCsv(value) {
  const text = String(value ?? '');
  return /[",\\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}
function identificationUseForTier(tier) {
  if (tier === 'tier_a') return 'fine_grained_vehicle';
  if (tier === 'tier_b') return 'vehicle_shape_direction';
  if (tier === 'tier_c') return 'traffic_flow_only';
  return '';
}
function numberOrNull(value) {
  const parsed = Number(String(value ?? '').trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
function resolutionGate(camera) {
  if (camera.height >= 1080) return 'tier_a_possible_if_distance_<=20m';
  if (camera.height >= 720) return 'tier_b_or_lower';
  return 'tier_c_recommended';
}
function activeGateSummary(camera, forward, reverse, review) {
  const missing = [];
  if (!review.tier) missing.push('visionTier');
  if (!identificationUseForTier(review.tier)) missing.push('identificationUse');
  const distance = numberOrNull(review.distance);
  if (!distance) missing.push('approachDistanceMeters');
  if (!forward) missing.push('lineZoneForward');
  if (!reverse) missing.push('lineZoneReverse');
  if (!review.reviewer) missing.push('reviewer');
  if (!review.reviewedAt) missing.push('reviewedAt');

  const blockers = [];
  if (review.tier === 'tier_a') {
    if (camera.height < 1080) blockers.push('tier_a requires height >= 1080');
    if (distance !== null && distance > 20) blockers.push('tier_a requires distance <= 20m');
  } else if (review.tier === 'tier_b') {
    if (distance !== null && (distance <= 20 || distance > 80)) blockers.push('tier_b requires 20m < distance <= 80m');
  } else if (review.tier === 'tier_c') {
    if (distance !== null && !(distance > 80 || camera.height < 720)) blockers.push('tier_c requires distance > 80m or height < 720');
  }

  const status = blockers.length
    ? 'blocked'
    : missing.length
      ? 'review_needed'
      : review.status === 'active'
        ? 'active_candidate_ready_for_promote_dry_run'
        : 'ready_to_mark_active';
  return { status, missing, blockers, resolution: resolutionGate(camera) };
}
function renderGateSummary(camera, forward, reverse) {
  const review = reviewFor(camera);
  const summary = activeGateSummary(camera, forward, reverse, review);
  const statusClass = summary.status === 'blocked'
    ? 'gateBad'
    : summary.status === 'review_needed'
      ? 'gateWarn'
      : 'gateOk';
  gateSummary.innerHTML = [
    '<strong>Current Review Gate</strong>',
    '<div>status: <span class="' + statusClass + '">' + summary.status + '</span></div>',
    '<div>resolutionGate: ' + summary.resolution + '</div>',
    '<div>missing: ' + (summary.missing.length ? summary.missing.join(', ') : '-') + '</div>',
    '<div>blockers: ' + (summary.blockers.length ? summary.blockers.join(', ') : '-') + '</div>',
    '<div>active promotion still requires npm run vision-calibration:apply-line-zone-patch -- --apply, audit, and promote gate.</div>'
  ].join('');
}
function buildPatchRow(camera, forward, reverse, reviewOverride, frameFile) {
  const review = reviewOverride || reviewFor(camera);
  const tier = review.tier || '';
  const status = review.status || 'review_needed';
  const lineReady = Boolean(forward && reverse);
  const values = {
    reviewStatus: status,
    cctvId: camera.cctvId,
    cctvName: camera.cctvName,
    region: camera.region,
    visionTier: tier,
    identificationUse: identificationUseForTier(tier),
    approachDistanceMeters: review.distance || '',
    resolutionWidth: camera.width,
    resolutionHeight: camera.height,
    directionCalibrationStatus: lineReady ? 'calibrated' : 'pending',
    lineZoneForward: forward,
    lineZoneReverse: reverse,
    evidenceSource: 'sample_frame_capture',
    verificationMethod: 'ffmpeg_multi_frame_probe_and_manual_line_zone',
    sampleCount: camera.frames.length,
    datasetPath: report.sampleDir,
    reviewer: review.reviewer || '',
    reviewedAt: review.reviewedAt || '',
    notes: [
      'manual_line_zone_review',
      'frame=' + (frameFile || ''),
      'active_requires_distance_reviewer_reviewedAt'
    ].join('; ')
  };
  return patchHeaders.map((header) => escapeCsv(values[header] ?? '')).join(',');
}
function buildAllPatchRows() {
  return [
    patchHeaders.join(','),
    ...report.cameras.map((camera) => {
      const points = state.points[keyFor(camera)] || { forward: [], reverse: [] };
      return buildPatchRow(
        camera,
        zoneValue(points.forward || []),
        zoneValue(points.reverse || []),
        reviewFor(camera),
        camera.frames[0] ? camera.frames[0].file : ''
      );
    })
  ].join('\\n');
}
function updateOutput() {
  const camera = currentCamera();
  const points = cameraPoints();
  const forward = zoneValue(points.forward);
  const reverse = zoneValue(points.reverse);
  output.value = [
    'cctvId=' + camera.cctvId,
    'lineZoneForward=' + (forward || '[needs_two_points]'),
    'lineZoneReverse=' + (reverse || '[needs_two_points]'),
    'resolutionWidth=' + camera.width,
    'resolutionHeight=' + camera.height,
    'directionCalibrationStatus=' + (forward && reverse ? 'calibrated' : 'pending')
  ].join('\\n');
  patchOutput.value = patchHeaders.join(',') + '\\n' + buildPatchRow(camera, forward, reverse, reviewFor(camera), currentFrame().file);
  allPatchOutput.value = buildAllPatchRows();
  renderGateSummary(camera, forward, reverse);
}
function drawLine(points, color, label) {
  if (points.length === 0) return;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  points.forEach((point, index) => {
    ctx.beginPath();
    ctx.arc(point[0], point[1], 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillText(label + (index + 1), point[0] + 10, point[1] - 10);
  });
  if (points.length === 2) {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    ctx.lineTo(points[1][0], points[1][1]);
    ctx.stroke();
  }
}
function redraw() {
  const camera = currentCamera();
  const points = cameraPoints();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);
  ctx.font = '18px ui-monospace, monospace';
  drawLine(points.forward, '#22c55e', 'F');
  drawLine(points.reverse, '#f97316', 'R');
  cameraMeta.innerHTML = [
    '<strong>' + camera.cctvId + '</strong> ' + camera.cctvName,
    'source=' + camera.source,
    'resolution=' + camera.width + 'x' + camera.height,
    'sampleDir=' + report.sampleDir
  ].map((line) => '<div>' + line + '</div>').join('');
  updateOutput();
}
function loadFrame() {
  const frame = currentFrame();
  img.onload = () => {
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    redraw();
  };
  img.src = frame.file;
}
function fillControls() {
  report.cameras.forEach((camera, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = camera.cctvId + ' · ' + camera.cctvName + ' · ' + camera.width + 'x' + camera.height;
    cameraSelect.appendChild(option);
  });
  fillFrames();
}
function fillFrames() {
  frameSelect.innerHTML = '';
  currentCamera().frames.forEach((frame, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = frame.file + ' · ' + frame.width + 'x' + frame.height;
    frameSelect.appendChild(option);
  });
}
canvas.addEventListener('click', (event) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const point = [
    Math.round((event.clientX - rect.left) * scaleX),
    Math.round((event.clientY - rect.top) * scaleY)
  ];
  const points = cameraPoints()[modeSelect.value];
  if (points.length >= 2) points.shift();
  points.push(point);
  saveState();
  redraw();
});
cameraSelect.addEventListener('change', () => {
  saveReviewInputs();
  state.cameraIndex = Number(cameraSelect.value);
  state.frameIndex = 0;
  fillFrames();
  hydrateReviewInputs();
  loadFrame();
});
frameSelect.addEventListener('change', () => {
  state.frameIndex = Number(frameSelect.value);
  loadFrame();
});
document.getElementById('undoBtn').addEventListener('click', () => {
  cameraPoints()[modeSelect.value].pop();
  saveState();
  redraw();
});
document.getElementById('resetBtn').addEventListener('click', () => {
  state.points[keyFor(currentCamera())] = { forward: [], reverse: [] };
  saveState();
  redraw();
});
document.getElementById('clearStorageBtn').addEventListener('click', () => {
  if (!confirm('Clear saved line-zone points and review fields for this sample set?')) return;
  state.points = {};
  state.review = {};
  localStorage.removeItem(storageKey);
  hydrateReviewInputs();
  redraw();
});
document.getElementById('copyAllCsvBtn').addEventListener('click', async () => {
  const text = allPatchOutput.value;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    allPatchOutput.focus();
    allPatchOutput.select();
    document.execCommand('copy');
  }
});
document.getElementById('downloadAllCsvBtn').addEventListener('click', () => {
  const blob = new Blob([allPatchOutput.value + '\\n'], { type: 'text/csv;charset=utf-8' });
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.download = 'cctv-vision-line-zone-patch.csv';
  anchor.click();
  URL.revokeObjectURL(anchor.href);
});
[tierSelect, distanceInput, reviewerInput, reviewedAtInput, statusSelect].forEach((input) => {
  input.addEventListener('input', () => { saveReviewInputs(); updateOutput(); });
  input.addEventListener('change', () => { saveReviewInputs(); updateOutput(); });
});
modeSelect.addEventListener('input', updateOutput);
modeSelect.addEventListener('change', updateOutput);
loadSavedState();
fillControls();
hydrateReviewInputs();
loadFrame();
</script>
</body>
</html>`;
}

function writeMarkdown(report, outputHtml, reviewModel) {
    const lines = [
        '# CCTV Line Zone Review Page',
        '',
        `- generatedAt: ${new Date().toISOString()}`,
        `- sampleReport: ${report.reportPath}`,
        `- sampleDir: ${report.sampleDir}`,
        `- reviewPage: ${outputHtml}`,
        `- cameras: ${reviewModel.length}`,
        '',
        '## Rule',
        '',
        '- 이 페이지는 line zone 좌표를 사람이 확인하기 위한 로컬 검토 도구다.',
        '- 좌표를 찍어도 운영 active 승격은 아니다.',
        '- active 승격에는 접근거리, reviewer, reviewedAt, forward/reverse line zone 검증이 함께 필요하다.',
        '',
    ];
    fs.writeFileSync(OUTPUT_MD, `${lines.join('\n')}\n`, 'utf8');
}

function run() {
    const options = parseArgs(process.argv.slice(2));
    const report = JSON.parse(fs.readFileSync(options.reportPath, 'utf8'));
    report.reportPath = options.reportPath;
    if (!report.sampleDir || !Array.isArray(report.samples)) {
        throw new Error('sample report must include sampleDir and samples');
    }

    const reviewModel = buildReviewModel(report);
    if (reviewModel.length === 0) {
        throw new Error('sample report has no captured frames');
    }

    const outputHtml = path.join(report.sampleDir, 'line-zone-review.html');
    fs.writeFileSync(outputHtml, buildHtml(report, reviewModel), 'utf8');
    writeMarkdown(report, outputHtml, reviewModel);
    console.log(JSON.stringify({
        output: {
            html: outputHtml,
            markdown: OUTPUT_MD,
        },
        summary: {
            cameras: reviewModel.length,
            frames: reviewModel.reduce((sum, camera) => sum + camera.frames.length, 0),
        },
    }, null, 2));
}

run();
