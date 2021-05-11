const test = require('ava')
const sinon = require('sinon')
const { MongoMemoryServer } = require('mongodb-memory-server')
const Config = require('../lib/config')
const Mongo = require('../lib/mongo')

test.before(async (t) => {
  const config = new Config({
    kms: {}
  })

  const mongo = new MongoMemoryServer()
  const mongoUri = await mongo.getUri()

  config.decrypt = sinon.stub().returns(mongoUri)
  t.context.Mongo = new Mongo({ config, log: { info: sinon.stub() } })
  await t.context.Mongo.connect()

  const { insertedId: userId1 } = await t.context.Mongo.db.collection('users').insertOne({
    name: 'austria'
  })
  t.context.userId1 = userId1

  const { insertedId: userId2 } = await t.context.Mongo.db.collection('users').insertOne({
    name: 'australia'
  })
  t.context.userId2 = userId2

  const { insertedId: pkgId1 } = await t.context.Mongo.db.collection('packages').insertOne({
    name: 'lithuania',
    maintainers: [{
      revenuePercent: 100,
      userId: userId1.toString()
    }],
    adRevenue: [
      {
        id: 'dddddddddddd',
        amount: 150
      }
    ],
    donationRevenue: [
      {
        id: 'bbbbbbbbbbbb',
        amount: 200
      },
      {
        id: 'cccccccccccc',
        amount: 300
      }
    ]
  })
  t.context.pkgId1 = pkgId1

  const { insertedId: pkgId2 } = await t.context.Mongo.db.collection('packages').insertOne({
    name: 'greece',
    adRevenue: [
      {
        id: 'aaaaaaaaaaaa',
        amount: 150
      }
    ],
    donationRevenue: [
      {
        id: 'bbbbbbbbbbbb',
        amount: 200
      }
    ]
  })
  t.context.pkgId2 = pkgId2

  const { insertedId: pkgId3 } = await t.context.Mongo.db.collection('packages').insertOne({
    name: 'argentina',
    maintainers: [{
      revenuePercent: 100,
      userId: userId1.toString()
    }],
    adRevenue: [
      {
        id: 'ffffffffffff',
        amount: 150
      }
    ]
  })
  t.context.pkgId3 = pkgId3

  sinon.stub(Date, 'now').returns(123456)
})

test.after(async (t) => {
  await t.context.Mongo.close()
})

test('updatePackagesIncomeToProcessed', async (t) => {
  const processedIds = ['aaaaaaaaaaaa', 'bbbbbbbbbbbb', 'cccccccccccc']

  await t.context.Mongo.updatePackagesIncomeToProcessed({ processedIds })

  const updatePkg1 = await t.context.Mongo.db.collection('packages').findOne({ _id: t.context.pkgId1 })

  // The ad revenues should not have been processed
  t.true(updatePkg1.adRevenue.find((a) => a.id === 'dddddddddddd').processed === undefined)
  t.true(updatePkg1.donationRevenue.every((a) => a.processed === true))

  const updatePkg2 = await t.context.Mongo.db.collection('packages').findOne({ _id: t.context.pkgId2 })
  t.true(updatePkg2.adRevenue.every((a) => a.processed === true))
  t.true(updatePkg2.donationRevenue.every((a) => a.processed === true))
})

test('appendPayoutsToMaintainers | have payouts', async (t) => {
  const maintainerPayouts = new Map()
  maintainerPayouts.set(t.context.userId1.toString(), {
    id: 'dddddddddddd',
    amount: 1200,
    donationIds: ['bbbbbbbbbbbb', 'cccccccccccc'],
    adIds: ['aaaaaaaaaaaa']
  })
  maintainerPayouts.set(t.context.userId2.toString(), {
    id: 'eeeeeeeeeeee',
    amount: 1500,
    donationIds: ['bbbbbbbbbbbb', 'cccccccccccc'],
    adIds: ['aaaaaaaaaaaa']
  })

  await t.context.Mongo.appendPayoutsToMaintainers({ maintainerPayouts })

  const updatedUser1 = await t.context.Mongo.db.collection('users').findOne({ _id: t.context.userId1 })
  t.deepEqual(updatedUser1.payouts[0], {
    ...maintainerPayouts.get(t.context.userId1.toString()),
    timestamp: 123456
  })
  const updatedUser2 = await t.context.Mongo.db.collection('users').findOne({ _id: t.context.userId2 })
  t.deepEqual(updatedUser2.payouts[0], {
    ...maintainerPayouts.get(t.context.userId2.toString()),
    timestamp: 123456
  })
})

test('appendPayoutsToMaintainers | no payouts', async (t) => {
  const mongo = new Mongo({})
  mongo.db = {
    collection: () => ({
      initializeUnorderedBulkOp: sinon.stub()
    })
  }
  const maintainerPayouts = new Map()
  await mongo.appendPayoutsToMaintainers({ maintainerPayouts })

  t.true(mongo.db.collection().initializeUnorderedBulkOp.notCalled)
})

test('close', async (t) => {
  const mongo = new Mongo({})
  await mongo.close() // nothing to close here
  mongo.mongoClient = { close: sinon.stub() }
  await mongo.close()
  t.true(mongo.mongoClient.close.calledOnce)
})
