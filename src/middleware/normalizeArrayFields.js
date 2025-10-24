function normalizeArrayFields(req, res, next) {
  const arrayFields = ['artist_ids', 'genres']; // add all fields that should always be arrays

  for (const field of arrayFields) {
    const value = req.body[field];

    if (typeof value === 'string' && value.trim() !== '') {
      // Handle comma-separated strings as arrays (e.g. "a,b,c") or single value
      if (value.includes(',')) {
        req.body[field] = value.split(',').map(s => s.trim()).filter(Boolean);
      } else {
        req.body[field] = [value.trim()];
      }
    } else if (!Array.isArray(value)) {
      // Not sent or invalid
      req.body[field] = [];
    }
  }

  next();
}

module.exports = normalizeArrayFields;