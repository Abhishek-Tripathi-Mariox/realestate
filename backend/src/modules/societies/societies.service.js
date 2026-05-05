const { v4: uuidv4 } = require('uuid');
const { notDeleted } = require('../../utils/notDeleted');
const {
  Society, Sale, SalePaymentEntry, Purchase, ExpenseBill, Vendor,
  Inventory, Partner, SocietyPhase, Transaction, CommissionBill,
} = require('../../models');

const stripId = ({ _id, ...rest }) => rest;

const list = async () => {
  const societies = await Society.find({}).lean();
  return societies.map(stripId);
};

const create = async (body) => {
  const society = {
    id: uuidv4(),
    name: body.name,
    location: body.location,
    totalArea: body.totalArea,
    startDate: body.startDate,
    status: body.status || 'Active',
    notes: body.notes || '',
    createdAt: new Date(),
  };
  await Society.create(society);
  return society;
};

const update = async (id, body) => {
  await Society.updateOne({ id }, { $set: { ...body, updatedAt: new Date() } });
  const updated = await Society.findOne({ id }).lean();
  if (!updated) return null;
  return stripId(updated);
};

const remove = async (societyId) => {
  // Cascade hard-delete (legacy behavior preserved).
  await Transaction.deleteMany({ societyId });
  const sales = await Sale.find({ societyId }).lean();
  for (const sale of sales) {
    await SalePaymentEntry.deleteMany({ saleId: sale.id });
  }
  await Sale.deleteMany({ societyId });
  await Purchase.deleteMany({ societyId });
  await ExpenseBill.deleteMany({ societyId });
  await Vendor.deleteMany({ societyId });
  await Inventory.deleteMany({ societyId });
  await Partner.deleteMany({ societyId });
  await SocietyPhase.deleteMany({ societyId });
  await Society.deleteOne({ id: societyId });
};

const summary = async (societyId) => {
  const [inventory, sales, purchases, expenseBills, commissionBills] = await Promise.all([
    Inventory.find(notDeleted({ societyId })).lean(),
    Sale.find(notDeleted({ societyId })).lean(),
    Purchase.find(notDeleted({ societyId })).lean(),
    ExpenseBill.find(notDeleted({ societyId })).lean(),
    CommissionBill.find(notDeleted({ societyId })).lean(),
  ]);

  const totalInventory = inventory.length;
  const soldInventory = inventory.filter(i => i.status === 'Sold').length;
  const availableInventory = inventory.filter(i => i.status === 'Available').length;

  const totalSaleAmount = sales.reduce((sum, s) => sum + (s.finalAmount || 0), 0);
  const totalReceived = sales.reduce((sum, s) => sum + (s.amountPaid || 0), 0);
  const totalPending = totalSaleAmount - totalReceived;

  const totalPurchaseAmount = purchases.reduce((sum, p) => sum + (p.dealAmount ?? p.totalCost ?? 0), 0);
  const totalPurchasePaid = purchases.reduce((sum, p) => sum + (p.amountPaid || 0), 0);

  const totalExpenses = expenseBills.reduce((sum, e) => sum + (e.amount || 0), 0);
  const totalExpensesPaid = expenseBills.reduce((sum, e) => sum + (e.paidAmount || 0), 0);

  const totalCommissions = commissionBills.reduce((sum, c) => sum + (c.amount || 0), 0);
  const totalCommissionsPaid = commissionBills.reduce((sum, c) => sum + (c.paidAmount || 0), 0);

  const totalPayables = (totalExpenses - totalExpensesPaid) + (totalCommissions - totalCommissionsPaid);
  const netProfitLoss = totalReceived - totalPurchasePaid - totalExpensesPaid - totalCommissionsPaid;

  return {
    totalInventory, soldInventory, availableInventory,
    totalSaleAmount,
    totalSalesAmount: totalSaleAmount,
    salesCount: sales.length,
    totalReceived, totalPending,
    totalPurchaseAmount,
    purchaseCount: purchases.length,
    totalPurchasePaid,
    totalExpenses, totalExpensesPaid,
    expenseBillCount: expenseBills.length,
    totalCommissions, totalCommissionsPaid,
    commissionBillCount: commissionBills.length,
    totalPayables,
    netProfitLoss,
  };
};

module.exports = { list, create, update, remove, summary };
