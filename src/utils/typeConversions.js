function toNum(v, def) {
    if (v === undefined || v === null || v === '') return def;
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
}

function toDate(v) {
    if (!v) return null;
    const d = v instanceof Date ? v : new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString();
}

function toDateOnly(v) {
    if (!v) return null;
    const d = v instanceof Date ? v : new Date(v);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function toTextArray(val) {
    if (val === undefined) return undefined;
    if (Array.isArray(val)) return val.map(String);
    if (typeof val === 'string') {
        const t = val.trim();
        if (!t) return [];
        return t.includes(',') ? t.split(',').map(s => s.trim()).filter(Boolean) : [t];
    }
    return [];
}

module.exports = {
    toNum,
    toDate,
    toDateOnly,
    toTextArray
}