const { MongoClient, ObjectId } = require('mongodb')

const MONGO_DB = 'flossbank_db'
const PACKAGES_COLLECTION = 'packages'
const MAINTAINERS_COLLECTION = 'users'

class Mongo {
  constructor ({ config, log }) {
    this.log = log
    this.config = config
    this.db = null
    this.mongoClient = null
  }

  async connect () {
    const mongoUri = await this.config.getMongoUri()
    this.mongoClient = new MongoClient(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    })
    await this.mongoClient.connect()

    this.db = this.mongoClient.db(MONGO_DB)
  }

  async close () {
    if (this.mongoClient) return this.mongoClient.close()
  }

  async updatePackagesIncomeToProcessed ({ processedIds }) {
    // Update donation revenue that was processed to have the processed field
    await this.db.collection(PACKAGES_COLLECTION).updateMany({
      'donationRevenue.id': { $in: processedIds }
    }, { $set: { 'donationRevenue.$[donation].processed': true } },
    {
      arrayFilters: [{ 'donation.id': { $in: processedIds } }]
    })

    // Update ad revenue that was processed to have the processed field
    return this.db.collection(PACKAGES_COLLECTION).updateMany({
      'adRevenue.id': { $in: processedIds }
    }, { $set: { 'adRevenue.$[ad].processed': true } },
    {
      arrayFilters: [{ 'ad.id': { $in: processedIds } }]
    })
  }

  async appendPayoutsToMaintainers ({ maintainerPayouts }) {
    if (!maintainerPayouts.size) return

    const bulkUpdates = this.db.collection(MAINTAINERS_COLLECTION).initializeUnorderedBulkOp()

    for (const [maintainerId, payout] of maintainerPayouts.entries()) {
      bulkUpdates.find({
        _id: ObjectId(maintainerId)
      }).updateOne({
        $push: {
          payouts: {
            ...payout,
            timestamp: Date.now()
          }
        }
      })
    }

    return bulkUpdates.execute()
  }

  async getPackagesWithMaintainersAndRevenue () {
    this.log.info('Retrieving all packages with maintainers and revenue from db')

    return this.db.collection(PACKAGES_COLLECTION).aggregate([
      {
        $match: {
          hasMaintainers: true,
          $or: [
            { 'adRevenue.processed': { $ne: true } },
            { 'donationRevenue.processed': { $ne: true } }
          ]
        }
      }, {
        $project: {
          _id: 1,
          name: 1,
          maintainers: 1,
          adRevenue: {
            $filter: {
              input: '$adRevenue',
              as: 'ad',
              cond: { $ne: ['$$ad.processed', true] }
            }
          },
          donationRevenue: {
            $filter: {
              input: '$donationRevenue',
              as: 'dono',
              cond: { $ne: ['$$dono.processed', true] }
            }
          }
        }
      }
    ]).toArray()
  }
}

module.exports = Mongo
