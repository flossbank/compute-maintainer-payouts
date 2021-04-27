# compute-maintainer-payouts

Lambda that runs on a cron (once a day) to
compute the payouts owed to maintainers. This is done by looking up owed money on every
package in our system that has at least one maintainer, and then computing a payout object and adding
the payout object to the payout ledger of maintainers. 
