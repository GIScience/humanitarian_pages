export function calculateDynamicRisk(
    data: any[],
    weights: Record<string, number>
): any[] {
    if (!data.length) return data;
    
    const cols = Object.keys(data[0]);
    const bounds: Record<string, { min: number, max: number }> = {};
    
    for (const col of cols) {
        if (!col.startsWith('exp_') && !col.startsWith('vul_') && !col.startsWith('cop_')) continue;
        if (col === 'exp_flo' || col === 'exp_cyc' || col === 'vul' || col === 'cop' || col === 'exp_flood' || col === 'exp_cyclone') continue;
        
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
        delete row['exp_flo'];
        delete row['exp_cyc'];

        let copSum = 0; let copW = 0;
        let vulSum = 0; let vulW = 0;
        
        let floodSum = 0; let floodW = 0;
        let cycloneSum = 0; let cycloneW = 0;

        for (const col of cols) {
            if (col === 'exp_flo' || col === 'exp_cyc' || col === 'vul' || col === 'cop' || col.startsWith('risk_') || col.startsWith('sus_')) continue;
            if (col === 'exp_flood' || col === 'exp_cyclone') continue;

            const w = getW(col);
            let rawValue = Number(row[col]);
            let val = normalize(rawValue, col);
            
            if (isNaN(val)) {
                if (col.startsWith('cop_')) val = 0;
                else if (col.startsWith('vul_')) val = 1;
                else val = 0;
            }

            if (col.startsWith('cop_')) {
                copSum += (1 - val) * w;
                copW += w;
            } else if (col.startsWith('vul_')) {
                vulSum += val * w;
                vulW += w;
            } else if (col.startsWith('exp_flo_')) {
                floodSum += val * w;
                floodW += w;
            } else if (col.startsWith('exp_cyc_')) {
                cycloneSum += val * w;
                cycloneW += w;
            }
        }
        
        let copScore = copW > 0 ? (copSum / copW) : 0;
        let vulScore = vulW > 0 ? (vulSum / vulW) : 0;

        row['cop'] = copScore;
        row['vul'] = vulScore;

        let susScore = Math.sqrt(vulScore * copScore);

        if (floodW > 0) {
            let expFloScore = floodSum / floodW;
            row['exp_flood'] = expFloScore;
            if (copW > 0 && vulW > 0) {
                row['sus_flood'] = susScore;
                row['risk_flood'] = Math.sqrt(expFloScore * susScore);
            }
        }
        if (cycloneW > 0) {
            let expCycScore = cycloneSum / cycloneW;
            row['exp_cyclone'] = expCycScore;
            if (copW > 0 && vulW > 0) {
                row['sus_cyclone'] = susScore;
                row['risk_cyclone'] = Math.sqrt(expCycScore * susScore);
            }
        }
    }
    
    return data;
}
