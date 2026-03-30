import {
    CoordinateTemplateRow,
    PublicStandardRow,
    inferRegion,
    normalizeText,
    parseCoordinate,
    pickString,
} from './public-standard-import';

export type TemplatePurpose = 'crime' | 'fire';
export type SupportedRegion = '김포' | '인천';

export type MoisOfficialRow = PublicStandardRow & {
    mngNo: string;
    managerTel: string;
    installedYm: string;
    dataDate: string;
    lastModified: string;
    cameraCount: number;
    region: SupportedRegion | '';
};

export type TemplateSiteCluster = {
    clusterId: string;
    region: SupportedRegion;
    source: string;
    purpose: TemplatePurpose;
    itemCount: number;
    seedLat: number;
    seedLng: number;
    normalizedAddress: string;
    districtToken: string;
    addressTokens: string[];
    items: CoordinateTemplateRow[];
};

export type ClusterMatchCandidate = {
    clusterId: string;
    officialMngNo: string;
    score: number;
    distanceMeters: number | null;
    addressOverlapCount: number;
    districtMatched: boolean;
    cameraCapacityOk: boolean;
    exactAddress: boolean;
    addressContainment: boolean;
    official: MoisOfficialRow;
};

export type ClusterAssignment = ClusterMatchCandidate & {
    cluster: TemplateSiteCluster;
    decision: 'active' | 'review_needed';
};

export type SemiAutoMatchResult = {
    updatedRows: CoordinateTemplateRow[];
    summary: {
        templateRowsConsidered: number;
        clusterCount: number;
        officialRows: number;
        candidateEdges: number;
        assignedClusters: number;
        autoActivatedRows: number;
        reviewRows: number;
        pendingRows: number;
    };
    assignments: ClusterAssignment[];
};

const CRIME_KEYWORDS = ['범죄', '방범', '생활방범', '차량방범'];
const FIRE_KEYWORDS = ['화재', '재난', '재해', '안전'];
const ADDRESS_STOPWORDS = new Set([
    '경기',
    '경기도',
    '인천',
    '인천광역시',
    '김포시',
    '인천시',
    'cctv',
    'cctv1',
    'cctv2',
    'cctv3',
    '방범',
    '소방',
]);

const EDGE_SCORE_MIN = 70;
const NEARBY_DISTANCE_MAX_M = 5000;

function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number) {
    const toRad = (value: number) => (value * Math.PI) / 180;
    const earthRadiusMeters = 6371000;
    const dLat = toRad(bLat - aLat);
    const dLng = toRad(bLng - aLng);
    const q =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;

    return 2 * earthRadiusMeters * Math.asin(Math.sqrt(q));
}

function purposeFromTemplate(row: CoordinateTemplateRow): TemplatePurpose {
    return row.name.includes('소방') ? 'fire' : 'crime';
}

function purposeMatches(templatePurpose: TemplatePurpose, officialPurpose: string) {
    if (templatePurpose === 'fire') {
        return FIRE_KEYWORDS.some((keyword) => officialPurpose.includes(keyword));
    }

    return CRIME_KEYWORDS.some((keyword) => officialPurpose.includes(keyword))
        && !FIRE_KEYWORDS.some((keyword) => officialPurpose.includes(keyword));
}

function tokenizeAddress(value: string) {
    return Array.from(new Set(
        (value.match(/[가-힣A-Za-z0-9]+/g) ?? [])
            .map((token) => token.trim())
            .filter((token) => token.length >= 2)
            .filter((token) => !ADDRESS_STOPWORDS.has(token.toLowerCase()))
    ));
}

function extractDistrictToken(value: string) {
    const tokens = value.match(/[가-힣A-Za-z0-9]+/g) ?? [];
    return tokens.find((token) => /(?:구|동|읍|면|리)$/.test(token)) ?? '';
}

function roundSeed(value: number) {
    return Number.isFinite(value) ? value.toFixed(4) : 'NaN';
}

function clusterKey(row: CoordinateTemplateRow, purpose: TemplatePurpose, seedLat: number, seedLng: number) {
    return [
        row.region,
        row.source,
        purpose,
        normalizeText(row.address),
        roundSeed(seedLat),
        roundSeed(seedLng),
    ].join('|');
}

function isMatchableStatus(status: string) {
    return ['pending', 'review_needed', 'review', 'draft', 'template', ''].includes(status.trim().toLowerCase());
}

export function normalizeMoisOfficialRow(row: Record<string, unknown>) {
    const roadAddress = pickString(row, ['LCTN_ROAD_NM_ADDR', 'roadAddress', '소재지도로명주소']);
    const jibunAddress = pickString(row, ['LCTN_LOTNO_ADDR', 'jibunAddress', '소재지지번주소']);
    const manager = pickString(row, ['MNG_INST_NM', 'mngInstNm', '관리기관명']);

    return {
        mngNo: pickString(row, ['MNG_NO', 'mngNo', '관리번호']),
        manager,
        managerTel: pickString(row, ['MNG_INST_TELNO', 'mngInstTelno', '관리기관전화번호']),
        purpose: pickString(row, ['INSTL_PRPS_SE_NM', 'instlPrpsSeNm', '설치목적구분']),
        roadAddress,
        jibunAddress,
        lat: parseCoordinate(pickString(row, ['WGS84_LAT', 'lat', '위도'])),
        lng: parseCoordinate(pickString(row, ['WGS84_LOT', 'lng', '경도'])),
        installedYm: pickString(row, ['INSTL_YM', 'instlYm', '설치년월']),
        dataDate: pickString(row, ['DAT_CRTR_YMD', 'datCrtrYmd', '자료기준일']),
        lastModified: pickString(row, ['LAST_MDFCN_PNT', 'lastMdfcnPnt', '수정일시']),
        cameraCount: Number(pickString(row, ['CAM_CNTOM', 'camCntom', '카메라대수'])) || 1,
        region: inferRegion(roadAddress || jibunAddress, manager) as SupportedRegion | '',
    } satisfies MoisOfficialRow;
}

export function filterTargetMoisRows(rows: MoisOfficialRow[]) {
    return rows.filter((row) =>
        (row.region === '김포' || row.region === '인천')
        && Number.isFinite(row.lat)
        && Number.isFinite(row.lng)
        && (CRIME_KEYWORDS.some((keyword) => row.purpose.includes(keyword))
            || FIRE_KEYWORDS.some((keyword) => row.purpose.includes(keyword)))
    );
}

export function buildTemplateSiteClusters(rows: CoordinateTemplateRow[]) {
    const byKey = new Map<string, TemplateSiteCluster>();

    rows.forEach((row) => {
        if (!(row.region === '김포' || row.region === '인천')) {
            return;
        }
        if (!(row.source === 'Gimpo-Local' || row.source === 'Incheon-Local')) {
            return;
        }
        if (!isMatchableStatus(row.status)) {
            return;
        }

        const purpose = purposeFromTemplate(row);
        const seedLat = parseCoordinate(row.seed_lat);
        const seedLng = parseCoordinate(row.seed_lng);
        const key = clusterKey(row, purpose, seedLat, seedLng);
        const existing = byKey.get(key);

        if (existing) {
            existing.items.push(row);
            existing.itemCount += 1;
            return;
        }

        const districtToken = extractDistrictToken(`${row.name} ${row.address}`);
        byKey.set(key, {
            clusterId: key,
            region: row.region,
            source: row.source,
            purpose,
            itemCount: 1,
            seedLat,
            seedLng,
            normalizedAddress: normalizeText(row.address),
            districtToken,
            addressTokens: tokenizeAddress(`${row.name} ${row.address}`),
            items: [row],
        });
    });

    return Array.from(byKey.values());
}

function distanceScore(distanceMeters: number | null) {
    if (distanceMeters === null) return 0;
    if (distanceMeters <= 75) return 150;
    if (distanceMeters <= 150) return 125;
    if (distanceMeters <= 300) return 105;
    if (distanceMeters <= 500) return 85;
    if (distanceMeters <= 1000) return 60;
    if (distanceMeters <= 2000) return 35;
    if (distanceMeters <= 4000) return 15;
    return 0;
}

function intersectCount(left: string[], right: string[]) {
    const rightSet = new Set(right);
    return left.filter((token) => rightSet.has(token)).length;
}

function scoreClusterCandidate(cluster: TemplateSiteCluster, official: MoisOfficialRow): ClusterMatchCandidate | null {
    if (official.region !== cluster.region) {
        return null;
    }
    if (!purposeMatches(cluster.purpose, official.purpose)) {
        return null;
    }

    const distanceMeters = Number.isFinite(cluster.seedLat) && Number.isFinite(cluster.seedLng)
        ? Math.round(haversineMeters(cluster.seedLat, cluster.seedLng, official.lat, official.lng))
        : null;

    const officialAddress = official.roadAddress || official.jibunAddress;
    const normalizedOfficialAddress = normalizeText(officialAddress);
    const officialTokens = tokenizeAddress(`${officialAddress} ${official.manager}`);
    const addressOverlapCount = intersectCount(cluster.addressTokens, officialTokens);
    const districtMatched = Boolean(cluster.districtToken)
        && `${official.roadAddress} ${official.jibunAddress}`.includes(cluster.districtToken);
    const cameraCapacityOk = official.cameraCount >= cluster.itemCount;

    const hasAddressContainment = Boolean(cluster.normalizedAddress)
        && Boolean(normalizedOfficialAddress)
        && (
            cluster.normalizedAddress.includes(normalizedOfficialAddress)
            || normalizedOfficialAddress.includes(cluster.normalizedAddress)
        );

    if (!hasAddressContainment && addressOverlapCount === 0 && distanceMeters !== null && distanceMeters > NEARBY_DISTANCE_MAX_M) {
        return null;
    }

    let score = distanceScore(distanceMeters);

    const exactAddress = Boolean(cluster.normalizedAddress)
        && Boolean(normalizedOfficialAddress)
        && cluster.normalizedAddress === normalizedOfficialAddress;

    if (exactAddress) {
        score += 170;
    } else if (hasAddressContainment) {
        score += 115;
    }

    score += Math.min(addressOverlapCount * 14, 70);

    if (districtMatched) {
        score += 35;
    }

    if (cameraCapacityOk) {
        score += 12;
    } else if (official.cameraCount > 0) {
        score -= 10;
    }

    if (official.manager.includes('도시안전정보센터') || official.manager.includes('구청') || official.manager.includes('소방')) {
        score += 5;
    }

    if ((distanceMeters ?? Number.POSITIVE_INFINITY) > 1500 && addressOverlapCount === 0 && !hasAddressContainment) {
        score -= 20;
    }

    if (score < EDGE_SCORE_MIN) {
        return null;
    }

    return {
        clusterId: cluster.clusterId,
        officialMngNo: official.mngNo,
        score,
        distanceMeters,
        addressOverlapCount,
        districtMatched,
        cameraCapacityOk,
        exactAddress,
        addressContainment: hasAddressContainment,
        official,
    };
}

function decideAssignment(candidate: ClusterMatchCandidate): 'active' | 'review_needed' {
    const distance = candidate.distanceMeters ?? Number.POSITIVE_INFINITY;

    if (
        candidate.exactAddress
        || (
            candidate.addressContainment
            && distance <= 250
            && candidate.addressOverlapCount >= 2
        )
        || (
            candidate.score >= 220
            && distance <= 100
            && candidate.districtMatched
            && candidate.addressOverlapCount >= 3
        )
    ) {
        return 'active';
    }

    return 'review_needed';
}

function buildCandidateEdges(clusters: TemplateSiteCluster[], officialRows: MoisOfficialRow[]) {
    const edges: Array<ClusterMatchCandidate & { cluster: TemplateSiteCluster }> = [];

    clusters.forEach((cluster) => {
        officialRows.forEach((official) => {
            const scored = scoreClusterCandidate(cluster, official);
            if (!scored) {
                return;
            }
            edges.push({
                ...scored,
                cluster,
            });
        });
    });

    edges.sort((left, right) =>
        right.score - left.score
        || (left.distanceMeters ?? Number.POSITIVE_INFINITY) - (right.distanceMeters ?? Number.POSITIVE_INFINITY)
        || right.cluster.itemCount - left.cluster.itemCount
    );

    return edges;
}

function assignClusters(edges: Array<ClusterMatchCandidate & { cluster: TemplateSiteCluster }>) {
    const assignedClusters = new Set<string>();
    const assignedOfficialRows = new Set<string>();
    const assignments: ClusterAssignment[] = [];

    for (const edge of edges) {
        if (assignedClusters.has(edge.clusterId) || assignedOfficialRows.has(edge.officialMngNo)) {
            continue;
        }

        assignedClusters.add(edge.clusterId);
        assignedOfficialRows.add(edge.officialMngNo);
        assignments.push({
            ...edge,
            decision: decideAssignment(edge),
        });
    }

    return assignments;
}

export function applySemiAutoMoisMatches(
    templateRows: CoordinateTemplateRow[],
    officialRows: MoisOfficialRow[],
    sourceDocument: string
): SemiAutoMatchResult {
    const clusters = buildTemplateSiteClusters(templateRows);
    const filteredOfficialRows = filterTargetMoisRows(officialRows);
    const edges = buildCandidateEdges(clusters, filteredOfficialRows);
    const assignments = assignClusters(edges);
    const assignmentByCluster = new Map(assignments.map((assignment) => [assignment.clusterId, assignment]));
    const itemById = new Map<string, CoordinateTemplateRow>();

    const updatedRows = templateRows.map((row) => {
        itemById.set(row.id, row);
        return { ...row };
    });

    const nextRows = updatedRows.map((row) => {
        const cluster = clusters.find((entry) => entry.items.some((item) => item.id === row.id));
        if (!cluster) {
            return row;
        }

        const assignment = assignmentByCluster.get(cluster.clusterId);
        if (!assignment) {
            return row;
        }

        const officialAddress = assignment.official.roadAddress || assignment.official.jibunAddress;
        const notePrefix = assignment.decision === 'active' ? '반자동 공식 승격' : '반자동 검토 대기';

        return {
            ...row,
            lat: assignment.official.lat.toFixed(7),
            lng: assignment.official.lng.toFixed(7),
            status: assignment.decision,
            source_document: sourceDocument,
            note: `${notePrefix} (mng=${assignment.official.mngNo}, score=${assignment.score}, dist=${assignment.distanceMeters ?? 'NA'}m)`,
            matched_mng_no: assignment.official.mngNo,
            matched_manager: assignment.official.manager,
            matched_purpose: assignment.official.purpose,
            matched_address: officialAddress,
            matched_distance_m: assignment.distanceMeters !== null ? String(assignment.distanceMeters) : '',
            matched_score: String(assignment.score),
            matched_camera_count: String(assignment.official.cameraCount),
            match_strategy: assignment.decision === 'active' ? 'semi_auto_high_confidence' : 'semi_auto_review',
        } satisfies CoordinateTemplateRow;
    });

    return {
        updatedRows: nextRows,
        summary: {
            templateRowsConsidered: templateRows.filter((row) => isMatchableStatus(row.status)).length,
            clusterCount: clusters.length,
            officialRows: filteredOfficialRows.length,
            candidateEdges: edges.length,
            assignedClusters: assignments.length,
            autoActivatedRows: nextRows.filter((row) => row.status === 'active' && row.match_strategy === 'semi_auto_high_confidence').length,
            reviewRows: nextRows.filter((row) => row.status === 'review_needed').length,
            pendingRows: nextRows.filter((row) => row.status === 'pending').length,
        },
        assignments,
    };
}
