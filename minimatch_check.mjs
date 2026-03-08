import { minimatch } from 'minimatch'

const k = 11
const pattern = Array.from({ length: k }, () => '**/a').join('/') + '/b'
const path = Array(30).fill('a').join('/')

console.log('Testing minimatch ReDoS vulnerability...')
console.log(`Pattern: ${pattern}`)
console.log(`Path: ${path}`)

const start = Date.now()
const result = minimatch(path, pattern)
const duration = Date.now() - start
console.log(`Result: ${result}`)
console.log(`Duration: ${duration}ms`)

if (duration > 1000) {
    console.error('VULNERABLE: minimatch is still slow!')
    process.exit(1)
} else {
    console.log('SAFE: minimatch is fast.')
}
