const test = require('ava')
const sinon = require('sinon')
const { MongoMemoryServer } = require('mongodb-memory-server')
const Config = require('../lib/config')
const Mongo = require('../lib/mongo')
const Process = require('../lib/process')
const { ulid } = require('ulid')

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
    maintainers: [
      {
        revenuePercent: 50,
        userId: userId1.toString()
      },
      {
        revenuePercent: 50,
        userId: userId2.toString()
      }
    ],
    adRevenue: [
      {
        id: ulid(),
        amount: 100
      }
    ],
    donationRevenue: [
      {
        id: ulid(),
        amount: 200
      },
      {
        id: ulid(),
        amount: 300
      },
      {
        id: ulid(),
        amount: 1000,
        processed: true
      }
    ]
  })
  t.context.pkgId1 = pkgId1

  const { insertedId: pkgId2 } = await t.context.Mongo.db.collection('packages').insertOne({
    name: 'greece',
    adRevenue: [
      {
        id: ulid(),
        amount: 150
      }
    ],
    donationRevenue: [
      {
        id: ulid(),
        amount: 200
      }
    ]
  })
  t.context.pkgId2 = pkgId2

  const { insertedId: pkgId3 } = await t.context.Mongo.db.collection('packages').insertOne({
    name: 'argentina',
    maintainers: [{
      revenuePercent: 100,
      userId: userId2.toString()
    }],
    adRevenue: [
      {
        id: ulid(),
        amount: 150
      },
      {
        id: ulid(),
        amount: 150,
        processed: true
      }
    ]
  })
  t.context.pkgId3 = pkgId3

  const { insertedId: pkgId4 } = await t.context.Mongo.db.collection('packages').insertOne({
    name: 'brazil',
    maintainers: [{
      revenuePercent: 0,
      userId: userId2.toString()
    }],
    donationRevenue: [
      {
        id: ulid(),
        amount: 1000
      }
    ]
  })
  t.context.pkgId4 = pkgId4
})

test.after(async (t) => {
  await t.context.Mongo.close()
})

test('should compute and update maintainers successfully', async (t) => {
  await Process.process({ db: t.context.Mongo, log: { info: sinon.stub() } })

  const updatedUser1 = await t.context.Mongo.db.collection('users').findOne({ _id: t.context.userId1 })
  // User 1 should have half revenue from package 1
  t.deepEqual(updatedUser1.payouts[0].amount, 300)

  const updatedUser2 = await t.context.Mongo.db.collection('users').findOne({ _id: t.context.userId2 })
  // User 2 should have half revenue from package 1 and all revenue available of package 3
  // they don't get any of the 1000 in package 4 (brazil) since their rev share is 0%
  t.deepEqual(updatedUser2.payouts[0].amount, 450)

  const updatePkg1 = await t.context.Mongo.db.collection('packages').findOne({ _id: t.context.pkgId1 })
  t.true(updatePkg1.adRevenue.every((a) => a.processed === true))
  t.true(updatePkg1.donationRevenue.every((a) => a.processed === true))

  // Package 2 should not have been touched with processed fields as they have no maintainers
  const updatePkg2 = await t.context.Mongo.db.collection('packages').findOne({ _id: t.context.pkgId2 })
  t.true(updatePkg2.adRevenue.every((a) => a.processed === undefined))
  t.true(updatePkg2.donationRevenue.every((a) => a.processed === undefined))

  const updatePkg3 = await t.context.Mongo.db.collection('packages').findOne({ _id: t.context.pkgId3 })
  t.true(updatePkg3.adRevenue.every((a) => a.processed === true))

  const updatePkg4 = await t.context.Mongo.db.collection('packages').findOne({ _id: t.context.pkgId4 })
  t.true(updatePkg4.donationRevenue.every((a) => a.processed === true))
})
