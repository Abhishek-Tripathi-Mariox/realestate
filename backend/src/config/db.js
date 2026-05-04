const mongoose = require('mongoose')

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URL)
    console.log(`MongoDB Connected: ${conn.connection.host}`)
    
    // Initialize default data
    await initializeDefaults()
    
    return conn
  } catch (error) {
    console.error('MongoDB connection error:', error.message)
    throw error
  }
}

const initializeDefaults = async () => {
  const User = require('../models/User')
  const Account = require('../models/Account')
  const ExpenseCategory = require('../models/ExpenseCategory')
  const VendorType = require('../models/VendorType')
  const bcrypt = require('bcryptjs')
  const { v4: uuidv4 } = require('uuid')
  
  try {
    // Create default admin
    const adminExists = await User.findOne({ email: 'admin@realestate.com' })
    if (!adminExists) {
      const hashedPassword = await bcrypt.hash('Admin@123', 10)
      await User.create({
        id: uuidv4(),
        email: 'admin@realestate.com',
        password: hashedPassword,
        name: 'Super Admin',
        role: 'super_admin'
      })
      console.log('Default Super Admin created: admin@realestate.com / Admin@123')
    }
    
    // Create default accounts
    const accountsExist = await Account.countDocuments()
    if (accountsExist === 0) {
      const defaultAccounts = [
        { name: 'Cash-in-Hand', type: 'CASH', isDefault: true },
        { name: 'HDFC Bank', type: 'BANK', isDefault: false },
        { name: 'ICICI Bank', type: 'BANK', isDefault: false }
      ]
      for (const acc of defaultAccounts) {
        await Account.create({ id: uuidv4(), ...acc, isActive: true })
      }
      console.log('Default accounts created')
    }
    
    // Create default expense categories
    const categoriesExist = await ExpenseCategory.countDocuments()
    if (categoriesExist === 0) {
      const categories = ['Civil', 'Tiles', 'Electrical', 'Plumbing', 'Paint', 'Labour', 'Legal', 'Marketing', 'Office', 'Other']
      for (const name of categories) {
        await ExpenseCategory.create({ id: uuidv4(), name, isActive: true })
      }
      console.log('Default expense categories created')
    }
    
    // Create default vendor types
    const vendorTypesExist = await VendorType.countDocuments()
    if (vendorTypesExist === 0) {
      const types = ['Electrician', 'Broker', 'Labour', 'Legal', 'Marketing', 'Plumber', 'Civil', 'Tiles', 'Paint', 'Carpenter', 'Other']
      for (const name of types) {
        await VendorType.create({ id: uuidv4(), name, isActive: true })
      }
      console.log('Default vendor types created')
    }
  } catch (error) {
    console.error('Error initializing defaults:', error)
  }
}

module.exports = connectDB
