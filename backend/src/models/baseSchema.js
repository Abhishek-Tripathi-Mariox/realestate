const mongoose = require('mongoose');

// Common schema options used by every model. We keep `strict: false` so the
// existing routes (which freely spread `req.body` into updates) keep working
// without losing any fields. Auto-timestamps are off because the codebase
// assigns its own `createdAt` / `updatedAt` explicitly.
const baseSchemaOptions = {
  strict: false,
  versionKey: false,
  timestamps: false,
};

const buildSchema = (definition, options = {}) =>
  new mongoose.Schema(definition, { ...baseSchemaOptions, ...options });

module.exports = { mongoose, buildSchema };
