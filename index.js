const AWS = require('aws-sdk')
const Pino = require('pino')
const Process = require('./lib/process')
const Config = require('./lib/config')
const Db = require('./lib/mongo')

const kms = new AWS.KMS({ region: 'us-west-2' })

/*
- Get all packages with some sort of ad revenue or package revenue.
- Create a maintainer payout map with donation revenue id's and ad revenue id's .
- Bulk update the packages table, for all donation revenue and ad revenue that we
- are marking as processed, mark as processed: true.
- Bulk update maintainers to push a payout item onto the payout ledger.
*/
exports.handler = async () => {
  const log = Pino()
  const config = new Config({ kms })
  const db = new Db({ log, config })
  await db.connect()

  try {
    await Process.process({ db, log })
  } finally {
    await db.close()
  }
}
