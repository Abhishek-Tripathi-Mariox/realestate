const { v4: uuidv4 } = require('uuid');
const { notDeleted } = require('../../utils/notDeleted');
const { Note } = require('../../models');

const stripId = ({ _id, ...rest }) => rest;

// Search filters body + title client-style via a case-insensitive regex —
// fine for low-volume note lists. If the collection grows large enough that
// the regex scan hurts, swap in a text index.
const list = async (query) => {
  const filter = notDeleted();
  if (query.societyId && query.societyId !== 'all') {
    if (query.societyId === 'none') {
      // Explicit "general / company-wide notes" filter — match docs where the
      // field is missing OR null OR empty string so legacy rows still show.
      filter.$or = [{ societyId: null }, { societyId: '' }, { societyId: { $exists: false } }];
    } else {
      filter.societyId = query.societyId;
    }
  }
  if (query.search) {
    const rx = new RegExp(query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const searchOr = [{ title: rx }, { body: rx }];
    // Merge with an existing $or (societyId='none') via $and so neither clause
    // gets dropped.
    if (filter.$or) {
      filter.$and = [{ $or: filter.$or }, { $or: searchOr }];
      delete filter.$or;
    } else {
      filter.$or = searchOr;
    }
  }
  const notes = await Note.find(filter).sort({ updatedAt: -1, createdAt: -1 }).lean();
  return notes.map(stripId);
};

const getOne = async (id) => {
  const note = await Note.findOne(notDeleted({ id })).lean();
  if (!note) return { error: 'Note not found', status: 404 };
  return stripId(note);
};

const validate = (body) => {
  const title = (body.title || '').trim();
  if (!title) return { error: 'Title is required', status: 400 };
  if (title.length > 200) return { error: 'Title must be 200 characters or less', status: 400 };
  return null;
};

const create = async (body, userId) => {
  const err = validate(body);
  if (err) return err;
  const now = new Date();
  const note = {
    id: uuidv4(),
    title: body.title.trim(),
    body: (body.body || '').toString(),
    // Stored as null when not supplied so the "general notes" filter can match
    // explicit nulls + missing fields uniformly.
    societyId: body.societyId || null,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  };
  await Note.create(note);
  return note;
};

const update = async (id, body) => {
  const existing = await Note.findOne(notDeleted({ id })).lean();
  if (!existing) return { error: 'Note not found', status: 404 };
  const merged = { ...existing, ...body };
  const err = validate(merged);
  if (err) return err;

  const update = { updatedAt: new Date() };
  if (body.title !== undefined) update.title = body.title.trim();
  if (body.body !== undefined) update.body = (body.body || '').toString();
  // Allow clearing the link by sending societyId: '' or null.
  if (body.societyId !== undefined) update.societyId = body.societyId || null;

  await Note.updateOne({ id }, { $set: update });
  return { ...existing, ...update };
};

const remove = async (id) => {
  const existing = await Note.findOne(notDeleted({ id })).lean();
  if (!existing) return { error: 'Note not found', status: 404 };
  await Note.updateOne({ id }, { $set: { isDeleted: true, deletedAt: new Date() } });
  return { message: 'Note deleted' };
};

module.exports = { list, getOne, create, update, remove };
