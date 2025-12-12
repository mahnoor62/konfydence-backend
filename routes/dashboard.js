const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const User = require('../models/User');
const Organization = require('../models/Organization');
const Transaction = require('../models/Transaction');
const Lead = require('../models/Lead');
const FreeTrial = require('../models/FreeTrial');
const CustomPackage = require('../models/CustomPackage');
const CustomPackageRequest = require('../models/CustomPackageRequest');

const router = express.Router();

router.get('/metrics', authenticateToken, checkPermission('*'), async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const next30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const next60Days = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

    const activeB2CMembers = await User.countDocuments({
      role: 'b2c_user',
      'memberships.status': 'active',
      'memberships.endDate': { $gte: now }
    });

    const b2cTransactionsThisMonth = await Transaction.find({
      type: { $in: ['b2c_purchase', 'b2c_renewal'] },
      status: 'paid',
      createdAt: { $gte: startOfMonth }
    });

    const b2cRevenueThisMonth = b2cTransactionsThisMonth.reduce((sum, t) => sum + t.amount, 0);

    const b2cTransactionsAll = await Transaction.find({
      type: { $in: ['b2c_purchase', 'b2c_renewal'] },
      status: 'paid'
    });

    const b2cRevenueTotal = b2cTransactionsAll.reduce((sum, t) => sum + t.amount, 0);

    // Get B2B organizations
    const b2bOrganizations = await Organization.find({ segment: 'B2B' }).select('_id');
    const b2bOrgIds = b2bOrganizations.map(org => org._id);

    const activeB2BContracts = await CustomPackage.countDocuments({
      'contract.status': 'active',
      organizationId: { $in: b2bOrgIds }
    });

    const b2bTransactions = await Transaction.find({
      type: 'b2b_contract',
      status: 'paid'
    });

    const b2bRevenue = b2bTransactions.reduce((sum, t) => sum + t.amount, 0);

    // Get B2E organizations
    const b2eOrganizations = await Organization.find({ segment: 'B2E' }).select('_id');
    const b2eOrgIds = b2eOrganizations.map(org => org._id);

    const activeB2EContracts = await CustomPackage.countDocuments({
      'contract.status': 'active',
      organizationId: { $in: b2eOrgIds }
    });

    const b2eTransactions = await Transaction.find({
      type: 'b2e_contract',
      status: 'paid'
    });

    const b2eRevenue = b2eTransactions.reduce((sum, t) => sum + t.amount, 0);

    const newLeadsLast7Days = await Lead.countDocuments({
      createdAt: { $gte: last7Days }
    });

    const newLeadsLast30Days = await Lead.countDocuments({
      createdAt: { $gte: last30Days }
    });

    const trialsStartedLast30Days = await FreeTrial.countDocuments({
      createdAt: { $gte: last30Days }
    });

    const trialsCompletedLast30Days = await FreeTrial.countDocuments({
      status: 'completed',
      createdAt: { $gte: last30Days }
    });

    const activeCustomPackages = await CustomPackage.countDocuments({
      'contract.status': 'active'
    });

    // Calculate total revenue from active custom packages
    const activeCustomPackagesList = await CustomPackage.find({
      'contract.status': 'active'
    }).select('contractPricing.amount contractPricing.currency');

    const customPackagesRevenue = activeCustomPackagesList.reduce((sum, pkg) => {
      return sum + (pkg.contractPricing?.amount || 0);
    }, 0);

    const pendingCustomPackageRequests = await CustomPackageRequest.countDocuments({
      status: 'pending'
    });

    const recentCustomPackageRequests = await CustomPackageRequest.find({
      status: 'pending'
    })
      .populate('basePackageId', 'name')
      .sort({ createdAt: -1 })
      .limit(5)
      .select('organizationName contactName contactEmail basePackageId createdAt status');

    const recentSignups = await User.find({ role: 'b2c_user' })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('name email createdAt');

    const recentLeads = await Lead.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select('name email organizationName segment status createdAt');

    const upcomingExpiries = await CustomPackage.find({
      'contract.status': 'active',
      'contract.endDate': { $gte: now, $lte: next60Days }
    })
      .populate('organizationId', 'name')
      .sort({ 'contract.endDate': 1 })
      .limit(10)
      .select('organizationId contract.endDate contract.status');

    // Free Trial Metrics
    const activeTrials = await FreeTrial.countDocuments({
      status: 'active',
      endDate: { $gte: now }
    });

    const totalTrials = await FreeTrial.countDocuments({});

    const trialsCreatedLast7Days = await FreeTrial.countDocuments({
      createdAt: { $gte: last7Days }
    });

    const trialsCreatedLast30Days = await FreeTrial.countDocuments({
      createdAt: { $gte: last30Days }
    });

    const completedTrials = await FreeTrial.countDocuments({
      status: 'completed'
    });

    const expiredTrials = await FreeTrial.countDocuments({
      status: 'expired'
    });

    const totalUsedSeats = await FreeTrial.aggregate([
      {
        $group: {
          _id: null,
          totalUsed: { $sum: '$usedSeats' }
        }
      }
    ]);

    // Calculate total game plays - gamePlays is an array
    const totalGamePlaysResult = await FreeTrial.aggregate([
      {
        $project: {
          gamePlaysCount: { $size: { $ifNull: ['$gamePlays', []] } }
        }
      },
      {
        $group: {
          _id: null,
          totalPlays: { $sum: '$gamePlaysCount' }
        }
      }
    ]);

    const recentTrials = await FreeTrial.find()
      .populate('userId', 'name email')
      .populate('packageId', 'name')
      .populate('productId', 'name')
      .sort({ createdAt: -1 })
      .limit(5)
      .select('uniqueCode userId packageId productId status usedSeats maxSeats endDate createdAt codeApplications');

    res.json({
      b2c: {
        activeMembers: activeB2CMembers,
        revenueThisMonth: b2cRevenueThisMonth,
        revenueTotal: b2cRevenueTotal
      },
      b2b: {
        activeContracts: activeB2BContracts,
        revenue: b2bRevenue
      },
      b2e: {
        activeContracts: activeB2EContracts,
        revenue: b2eRevenue
      },
      leads: {
        newLast7Days: newLeadsLast7Days,
        newLast30Days: newLeadsLast30Days
      },
      demos: {
        startedLast30Days: trialsStartedLast30Days,
        completedLast30Days: trialsCompletedLast30Days
      },
      customPackages: {
        active: activeCustomPackages,
        revenue: customPackagesRevenue
      },
      customPackageRequests: {
        pending: pendingCustomPackageRequests,
        recent: recentCustomPackageRequests
      },
      recentActivity: {
        signups: recentSignups,
        leads: recentLeads,
        demos: recentTrials,
        upcomingExpiries
      },
      trials: {
        active: activeTrials,
        total: totalTrials,
        createdLast7Days: trialsCreatedLast7Days,
        createdLast30Days: trialsCreatedLast30Days,
        completed: completedTrials,
        expired: expiredTrials,
        totalUsedSeats: totalUsedSeats[0]?.totalUsed || 0,
        totalGamePlays: totalGamePlaysResult[0]?.totalPlays || 0,
        recent: recentTrials
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard metrics:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

