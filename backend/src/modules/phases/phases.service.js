const { v4: uuidv4 } = require('uuid');
const { SocietyPhase } = require('../../models');

const stripId = ({ _id, ...rest }) => rest;

const listForSociety = async (societyId) => {
  const phases = await SocietyPhase.find({ societyId }).lean();
  return phases.map(stripId);
};

const create = async (societyId, body) => {
  const phase = {
    id: uuidv4(),
    societyId,
    name: body.name,
    description: body.description || '',
    createdAt: new Date(),
  };
  await SocietyPhase.create(phase);
  return phase;
};

const update = async (id, body) => {
  await SocietyPhase.updateOne({ id }, { $set: { ...body, updatedAt: new Date() } });
  const updated = await SocietyPhase.findOne({ id }).lean();
  if (!updated) return null;
  return stripId(updated);
};

const remove = async (id) => {
  await SocietyPhase.deleteOne({ id });
};

module.exports = { listForSociety, create, update, remove };
