const app = require('./index')

const PORT = 3000
const server = app.listen(PORT, (err) => {
  if (err) throw err
  console.log(`Server running in http://127.0.0.1:${PORT}`)
})

process.on('SIGTERM', () => server.close(() => {
  console.log(`\nClosed server`)
  process.exit(0)
}));
process.on('SIGINT', () => server.close(() => {
  console.log(`\nClosed server`)
  process.exit(0)
}));
