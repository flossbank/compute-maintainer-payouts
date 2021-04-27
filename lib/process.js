const { ulid } = require('ulid')

const computePackagedOwedAmount = ({ pkg }) => {
  const adIds = []
  const donationIds = []
  let adAmountOwed = 0
  let donationAmountOwed = 0
  if (pkg.adRevenue) {
    adAmountOwed = pkg.adRevenue.reduce((acc, c) => {
      if (!c.processed) {
        adIds.push(c.id)
        return acc + c.amount
      }
      return acc
    }, 0)
  }

  if (pkg.donationRevenue) {
    donationAmountOwed = pkg.donationRevenue.reduce((acc, c) => {
      if (!c.processed) {
        donationIds.push(c.id)
        return acc + c.amount
      }
      return acc
    }, 0)
  }

  return {
    amountOwedTotal: adAmountOwed + donationAmountOwed,
    adIds,
    donationIds
  }
}

const computeOwedToMaintainer = ({ total, maintainer }) => {
  const { revenuePercent } = maintainer
  return total * revenuePercent / 100
}

exports.process = async ({ log, db }) => {
  log.info('Starting computation of maintainer payouts')

  const packages = await db.getPackagesWithMaintainersAndRevenue()

  const maintainerPayouts = new Map()
  const processedIds = []

  for (const p of packages) {
    const { maintainers } = p
    const { amountOwedTotal, adIds, donationIds } = computePackagedOwedAmount({ pkg: p })
    processedIds.push(...donationIds)
    processedIds.push(...adIds)

    for (const m of maintainers) {
      const amount = computeOwedToMaintainer({ total: amountOwedTotal, maintainer: m })

      const payout = maintainerPayouts.get(m.userId) || { id: ulid() }
      maintainerPayouts.set(m.userId, {
        ...payout,
        amount: payout.amount ? payout.amount + amount : amount,
        donationIds: payout.donationIds ? payout.donationIds.concat(donationIds) : donationIds,
        adIds: payout.adIds ? payout.adIds.concat(adIds) : adIds
      })
    }
  }

  log.info('Computed %s maintainer payouts', maintainerPayouts.size)
  log.info('Updating packages income to processed')
  await db.updatePackagesIncomeToProcessed({ processedIds })

  log.info('Appending payouts to maintainers ledger')
  await db.appendPayoutsToMaintainers({ maintainerPayouts })

  return { success: true }
}
