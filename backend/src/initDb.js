const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const {
  User, Account, AccountOpeningBalance, ExpenseCategory, VendorType,
} = require('./models');

const DEFAULT_EXPENSE_CATEGORIES = [
  'Civil', 'Tiles', 'Electrical', 'Plumbing', 'Paint', 'Labour', 'Legal', 'Marketing', 'Office', 'Other',
];

const DEFAULT_VENDOR_TYPES = [
  'Electrician', 'Broker', 'Labour', 'Legal', 'Marketing', 'Plumber', 'Civil', 'Tiles', 'Paint', 'Carpenter', 'Other',
];

const initializeDatabase = async () => {
  // Mongoose registers indexes on every model load via syncIndexes() so we
  // don't manually loop through collections any more — declared `unique` on
  // each schema's `id` (and User's `email`) is enough.

  const adminExists = await User.findOne({ email: 'admin@realestate.com' }).lean();
  if (!adminExists) {
    const hashedPassword = await bcrypt.hash('Admin@123', 10);
    await User.create({
      id: uuidv4(),
      email: 'admin@realestate.com',
      password: hashedPassword,
      name: 'Super Admin',
      role: 'super_admin',
      createdAt: new Date(),
    });
    console.log('Default Super Admin created');
  }

  if ((await ExpenseCategory.countDocuments()) === 0) {
    for (const name of DEFAULT_EXPENSE_CATEGORIES) {
      await ExpenseCategory.create({
        id: uuidv4(), name, isActive: true, isDeleted: false, createdAt: new Date(),
      });
    }
  }

  if ((await VendorType.countDocuments()) === 0) {
    for (const name of DEFAULT_VENDOR_TYPES) {
      await VendorType.create({
        id: uuidv4(), name, isActive: true, isDeleted: false, createdAt: new Date(),
      });
    }
  }
  console.log('Database initialized');
};

module.exports = { initializeDatabase };
