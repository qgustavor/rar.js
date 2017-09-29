/*
 * rar.js
 * Pure JavaScript implementation of the RAR format
 * 43081j
 * License: MIT, see LICENSE
 */

// FIXME: build fails without using this
import 'regenerator-runtime'

// RAR constants
const OS_NAMES = ['MS-DOS', 'OS/2', 'Windows', 'Unix', 'Mac', 'BeOS']
const METHODS = {
  STORE: 0x30,
  FASTEST: 0x31,
  FAST: 0x32,
  NORMAL: 0x33,
  GOOD: 0x34,
  BEST: 0x35
}

// RAR entry template
const TEMPLATE_ENTRY = {
  name: null,
  path: null,
  size: 0,
  sizePacked: 0,
  crc: null,
  offset: 0,
  blockSize: 0,
  headerSize: 0,
  encrypted: false,
  version: null,
  time: null,
  method: null,
  os: null,
  partial: false,
  continuesFrom: false,
  continues: false
}

async function loadFile (opts) {
  const file = {}

  if (typeof opts.createReadStream === 'function') {
    if (!opts.fileSize) throw Error('fileSize need to be defined')
    file.read = makeStreamReader(opts.createReadStream)
    file.fileSize = opts.fileSize
  } else if (opts.file) {
    const {fn, size} = makeBufferReader(opts.file)
    file.read = fn
    file.fileSize = size
  } else {
    throw Error('createReadStream or file need to be defined')
  }

  file.entries = []
  file.valid = false
  await validate(file)
  await readHeaders(file, file.size + 7)
  return file
}

function makeStreamReader (createReadStream) {
  return (start, length) => new Promise(resolve => {
    const chunks = []
    const stream = createReadStream({
      start,
      end: start + length
    })
    stream.on('data', d => {
      chunks.push(d)
    })
    stream.on('end', () => {
      resolve(Buffer.concat(chunks))
    })
  })
}

function makeBufferReader (buffer) {
  if (!(buffer instanceof Buffer)) buffer = Buffer.from(buffer)
  const fn = (start, length) => buffer.slice(start, start + length)
  const size = buffer.length
  return {fn, size}
}

// File signature
async function validate (file) {
  const data = await file.read(0, 14)
  if (data.slice(0, 7).toString() !== '\x52\x61\x72\x21\x1a\x07\x00') {
    throw Error('Invalid RAR archive')
  }

  file.crc = data.readUInt16LE(7)
  file.type = data.readUInt8(9)
  file.flags = data.readUInt16LE(10)
  file.size = data.readUInt16LE(12)

  if (file.type !== 0x73) {
    throw Error('Invalid RAR archive')
  }

  if ((file.flags & 0x80) !== 0) {
    throw Error('Encrypted RAR archives are not yet supported')
  }

  file.valid = true
}

// Read headers
async function readHeaders (file, offset) {
  if (file.fileSize <= 14) {
    return file.entries
  }

  while (1) {
    const data = await file.read(offset, 11)
    const crc = data.readUInt16LE(0)
    const type = data.readUInt8(2)
    const flags = data.readUInt16LE(3)

    let size = data.readUInt16LE(5)
    if ((flags & 0x8000) !== 0) {
      size += data.readUInt32LE(7)
    }

    switch (type) {
      case 0x74:
        const entry = await parseEntry(file, offset, data)
        entry.headerCRC = crc
        file.entries.push(entry)
        offset += entry.blockSize
        if (offset >= file.fileSize) return
        break

      default:
        offset += size
        if (offset >= file.fileSize) return
        break
    }
  }
}

// Entry parsing
async function parseEntry (file, offset, headerData) {
  const flags = headerData.readUInt16LE(3)
  const size = headerData.readUInt16LE(5)

  const data = await file.read(offset, size)
  const entry = Object.assign({}, TEMPLATE_ENTRY)

  entry.partial = (flags & 0x01) !== 0 || (flags & 0x02) !== 0
  entry.continuesFrom = (flags & 0x01) !== 0
  entry.continues = (flags & 0x02) !== 0
  entry.offset = offset
  entry.sizePacked = data.readUInt32LE(7)
  entry.size = data.readUInt32LE(11)
  entry.crc = data.readUInt32LE(16)

  let time = data.readUInt32LE(20).toString(2)
  if (time.length < 32) {
    time = '0'.repeat(32 - time.length) + time
  }
  time = time.match(/(\d{7})(\d{4})(\d{5})(\d{5})(\d{6})(\d{5})/).slice(1).map(val => parseInt(val, 2))
  entry.time = new Date(1980 + time[0], time[1] - 1, time[2], time[3], time[4], time[5])

  entry.os = OS_NAMES[data.readUInt8(15)]
  entry.version = data.readUInt8(24)
  entry.method = data.readUInt8(25)
  entry.encrypted = ((flags & 0x04) !== 0)

  const nameSize = data.readUInt16LE(26)
  if ((flags & 0x100) !== 0) {
    entry.sizePacked += data.readUInt32LE(32) * 0x100000000
    entry.size += data.readUInt32LE(36) * 0x100000000
    entry.path = data.slice(40, 40 + nameSize).toString()
  } else {
    entry.path = data.slice(32, 32 + nameSize).toString()
  }

  if ((flags & 0x200) !== 0 && entry.path.includes('\x00')) {
    entry.path = entry.path.split('\x00')[1]
  }

  entry.name = entry.path.substr(entry.path.lastIndexOf(
    entry.path.includes('\\') ? '\\' : '/'
  ) + 1)

  entry.headerSize = size
  entry.blockSize = entry.headerSize + entry.sizePacked

  return entry
}

// Get a file
async function getEntry (file, entry) {
  if (!file.valid) throw Error('Invalid RAR archive')
  if (entry.method !== METHODS.STORE) {
    throw Error('Compression is not yet supported')
  }

  return file.read(entry.offset + entry.headerSize, entry.blockSize - 1)
}

export { loadFile, getEntry }
