// Wrap an async controller so any thrown error becomes a 500 JSON response,
// matching the existing pattern used throughout the codebase.
const asyncHandler = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = { asyncHandler };
