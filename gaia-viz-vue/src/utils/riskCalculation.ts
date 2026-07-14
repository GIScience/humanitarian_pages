import type { DimensionColumns } from "@/enums/dimensions";
import { DIMENSION_PREFIX_VALUES } from "@/enums/dimensions";
import { HazardPrefix, resolveHazardPrefix } from "@/enums/hazards";

const EXP_FLOOD_COL = `exp_${HazardPrefix.FLOOD}`;
const EXP_CYCLONE_COL = `exp_${HazardPrefix.CYCLONE}`;

// "rank"/"ranking" columns are always excluded from indicator/dimension discovery - the
// Ranking tab is a read-only view of the already-computed risk score, never a weighted input.
export const RESERVED_DIMENSION_PREFIXES = new Set([
  ...DIMENSION_PREFIX_VALUES,
  "risk",
  "sus",
  "rank",
  "ranking",
]);
const RESERVED_PREFIXES = RESERVED_DIMENSION_PREFIXES;

// The Ranking tab is a read-only view of the already-computed risk score, never a weighted will not be selected
export function isRankingColumn(column: string): boolean {
  return column.toLowerCase().startsWith("ranking");
}

/**
 * Detects custom indicator dimensions from column naming convention (e.g. "edu_literacy_rate" -> "edu"),
 * the same convention already used for "vul_" / "cop_" / "exp_". A prefix only qualifies as a dimension
 * if at least one of its member columns actually holds numeric data - this keeps admin/name columns
 * (e.g. "ADM2_NAME") from being picked up as bogus dimensions.
 */
export function discoverCustomDimensionPrefixes(data: any[]): string[] {
  if (!data || data.length === 0) return [];
  const cols = Object.keys(data[0]);
  const candidates = new Set<string>();

  for (const col of cols) {
    const idx = col.indexOf("_");
    if (idx === -1) continue;
    const prefix = col.slice(0, idx);
    if (RESERVED_PREFIXES.has(prefix.toLowerCase())) continue;
    candidates.add(prefix);
  }

  return Array.from(candidates).filter((prefix) => {
    const memberCols = cols.filter((c) => c.startsWith(`${prefix}_`));
    return memberCols.some((c) =>
      data.some((row) => row[c] !== null && row[c] !== "" && !isNaN(Number(row[c]))),
    );
  });
}

export function getDimensionColumns(
    data: any[],
    selectedDisaster: string,
): DimensionColumns & { hazardPrefix: string } {
    const disasterSuffix = selectedDisaster.replace('risk_', '');
    const hazardPrefix = resolveHazardPrefix(disasterSuffix);

    const result: DimensionColumns = { exp: '', vul: '', cop: '' };
    if (!data || data.length === 0) return { ...result, hazardPrefix };

    const cols = Object.keys(data[0]);
    result.exp = cols.find(c => c === `exp_${disasterSuffix}`) || cols.find(c => c === 'exp') || '';
    result.vul = cols.find(c => c === 'vul') || '';
    result.cop = cols.find(c => c === 'cop') || '';

    for (const prefix of discoverCustomDimensionPrefixes(data)) {
        const composite = cols.find((c) => c === prefix);
        if (composite) result[prefix] = composite;
    }

    return { ...result, hazardPrefix };
}

export function calculateDynamicRisk(
    data: any[],
    weights: Record<string, number>
): any[] {
    if (!data.length) return data;

    const cols = Object.keys(data[0]);
    const customDimensionPrefixes = discoverCustomDimensionPrefixes(data);
    const susceptibilityDims = ['vul', 'cop', ...customDimensionPrefixes];

    const bounds: Record<string, { min: number, max: number }> = {};

    for (const col of cols) {
        const isTrackedPrefix = col.startsWith('exp_') || col.startsWith('vul_') || col.startsWith('cop_')
            || customDimensionPrefixes.some((p) => col.startsWith(`${p}_`));
        if (!isTrackedPrefix) continue;
        if (col === EXP_FLOOD_COL || col === EXP_CYCLONE_COL || col === 'vul' || col === 'cop' || col === 'exp_flood' || col === 'exp_cyclone') continue;

        let min = Infinity;
        let max = -Infinity;
        for (const row of data) {
            const v = Number(row[col]);
            if (isNaN(v)) continue;
            if (v < min) min = v;
            if (v > max) max = v;
        }
        if (min !== Infinity) {
            bounds[col] = { min, max };
        }
    }

    const normalize = (val: number, col: string) => {
        if (isNaN(val) || !bounds[col]) return val;
        const { min, max } = bounds[col];
        if (max === min) return val;
        return (val - min) / (max - min);
    };

    const getW = (col: string) => weights[col] ?? 1.0;

    for (const row of data) {
        // Remove stale computed columns that may linger from original parquet data
        delete row['cop'];
        delete row['vul'];
        delete row['exp_flood'];
        delete row['sus_flood'];
        delete row['risk_flood'];
        delete row['exp_cyclone'];
        delete row['sus_cyclone'];
        delete row['risk_cyclone'];
        delete row[EXP_FLOOD_COL];
        delete row[EXP_CYCLONE_COL];
        for (const prefix of customDimensionPrefixes) delete row[prefix];

        const dimSum: Record<string, number> = {};
        const dimW: Record<string, number> = {};

        let floodSum = 0; let floodW = 0;
        let cycloneSum = 0; let cycloneW = 0;

        for (const col of cols) {
            if (col === EXP_FLOOD_COL || col === EXP_CYCLONE_COL || col === 'vul' || col === 'cop'
                || customDimensionPrefixes.includes(col) || col.startsWith('risk_') || col.startsWith('sus_')) continue;
            if (col === 'exp_flood' || col === 'exp_cyclone') continue;

            const w = getW(col);
            let rawValue = Number(row[col]);
            let val = normalize(rawValue, col);

            let matchedDim: string | null = null;
            if (col.startsWith('cop_')) matchedDim = 'cop';
            else if (col.startsWith('vul_')) matchedDim = 'vul';
            else {
                for (const prefix of customDimensionPrefixes) {
                    if (col.startsWith(`${prefix}_`)) { matchedDim = prefix; break; }
                }
            }

            if (matchedDim) {
                if (isNaN(val)) val = matchedDim === 'cop' ? 0 : 1;
                const contribution = matchedDim === 'cop' ? (1 - val) : val;
                dimSum[matchedDim] = (dimSum[matchedDim] ?? 0) + contribution * w;
                dimW[matchedDim] = (dimW[matchedDim] ?? 0) + w;
                continue;
            }

            if (isNaN(val)) val = 0;
            if (col.startsWith(`${EXP_FLOOD_COL}_`)) {
                floodSum += val * w;
                floodW += w;
            } else if (col.startsWith(`${EXP_CYCLONE_COL}_`)) {
                cycloneSum += val * w;
                cycloneW += w;
            }
        }

        // A dimension with no assigned columns (dimW <= 0) is dropped from the susceptibility
        // score rather than treated as 0 - a custom upload isn't required to cover every base
        // dimension, so susceptibility is the geometric mean of whichever dimensions actually
        // have data for this row.
        const dimScore: Record<string, number> = {};
        const presentDims: string[] = [];
        for (const dim of susceptibilityDims) {
            const w = dimW[dim] ?? 0;
            if (w <= 0) continue;
            dimScore[dim] = (dimSum[dim] ?? 0) / w;
            row[dim] = dimScore[dim];
            presentDims.push(dim);
        }

        let susScore = 0;
        if (presentDims.length > 0) {
            const product = presentDims.reduce((acc, dim) => acc * dimScore[dim], 1);
            susScore = Math.pow(product, 1 / presentDims.length);
        }

        if (floodW > 0) {
            let expFloScore = floodSum / floodW;
            row['exp_flood'] = expFloScore;
            if (presentDims.length > 0) {
                row['sus_flood'] = susScore;
                row['risk_flood'] = Math.sqrt(expFloScore * susScore);
            }
        }
        if (cycloneW > 0) {
            let expCycScore = cycloneSum / cycloneW;
            row['exp_cyclone'] = expCycScore;
            if (presentDims.length > 0) {
                row['sus_cyclone'] = susScore;
                row['risk_cyclone'] = Math.sqrt(expCycScore * susScore);
            }
        }
    }

    return data;
}
