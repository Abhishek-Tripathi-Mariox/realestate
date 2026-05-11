require('dotenv').config()
const app = require('./src/app')
const connectDB = require('./src/config/db')

const PORT = process.env.PORT || 5000

// Connect to MongoDB and start server
connectDB().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Backend server running on port ${PORT}`)
    console.log(`Health check: http://localhost:${PORT}/health`)
    console.log(`API Base: http://localhost:${PORT}/api`)
  })
}).catch(err => {
  console.error('Failed to connect to MongoDB:', err)
  process.exit(1)
})


