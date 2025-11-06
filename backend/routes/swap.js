const express = require('express');
const SwapRequest = require('../models/SwapRequest');
const Event = require('../models/Event');
const Notification = require('../models/Notification');
const auth = require('../middleware/auth');
const router = express.Router();

// GET swappable slots from other users
router.get('/swappable-slots', auth, async (req, res) => {
  try {
    const slots = await Event.find({
      status: 'SWAPPABLE',
      userId: { $ne: req.user._id }
    }).populate('userId', 'name email');
    
    res.json({
      message: 'Swappable slots retrieved successfully',
      count: slots.length,
      slots: slots
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// CREATE swap request with enhanced tracking
router.post('/swap-request', auth, async (req, res) => {
  try {
    const { mySlotId, theirSlotId, message } = req.body;

    // Verify both slots exist and are SWAPPABLE
    const mySlot = await Event.findOne({ _id: mySlotId, userId: req.user._id });
    const theirSlot = await Event.findOne({ _id: theirSlotId, status: 'SWAPPABLE' });

    if (!mySlot || !theirSlot) {
      return res.status(400).json({ message: 'Invalid slots or slots not available for swap' });
    }

    if (mySlot.status !== 'SWAPPABLE') {
      return res.status(400).json({ message: 'Your slot is not marked as swappable' });
    }

    if (theirSlot.userId.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: 'Cannot swap with your own slot' });
    }

    // Check for existing pending requests
    const existingRequest = await SwapRequest.findOne({
      $or: [
        { requesterSlotId: mySlotId, requestedSlotId: theirSlotId },
        { requesterSlotId: theirSlotId, requestedSlotId: mySlotId }
      ],
      status: 'PENDING'
    });

    if (existingRequest) {
      return res.status(400).json({ message: 'Swap request already exists for these slots' });
    }

    // Create swap request with enhanced tracking
    const swapRequest = new SwapRequest({
      requesterSlotId: mySlotId,
      requestedSlotId: theirSlotId,
      requesterUserId: req.user._id,
      requestedUserId: theirSlot.userId,
      requestMessage: message,
      status: 'PENDING',
      createdAt: new Date()
    });

    await swapRequest.save();

    // Update both slots to SWAP_PENDING
    await Event.findByIdAndUpdate(mySlotId, { 
      status: 'SWAP_PENDING',
      lastUpdated: new Date()
    });
    await Event.findByIdAndUpdate(theirSlotId, { 
      status: 'SWAP_PENDING',
      lastUpdated: new Date()
    });

    // Create notification for the requested user
    await createNotification({
      userId: theirSlot.userId,
      type: 'SWAP_REQUEST',
      title: 'New Swap Request!',
      message: `${req.user.name} wants to swap time slots with you.`,
      relatedId: swapRequest._id,
      actionRequired: true
    });

    res.status(201).json({ 
      message: 'Swap request sent successfully', 
      swapRequest,
      notification: 'The other user has been notified of your request.'
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ENHANCED: RESPOND to swap request with complete tracking
router.post('/swap-response/:requestId', auth, async (req, res) => {
  try {
    const { accept, responseMessage } = req.body;
    const swapRequest = await SwapRequest.findById(req.params.requestId)
      .populate('requesterSlotId')
      .populate('requestedSlotId')
      .populate('requesterUserId', 'name email')
      .populate('requestedUserId', 'name email');

    if (!swapRequest) {
      return res.status(404).json({ message: 'Swap request not found' });
    }

    // Verify authorization
    if (swapRequest.requestedUserId._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to respond to this request' });
    }

    if (swapRequest.status !== 'PENDING') {
      return res.status(400).json({ message: 'Swap request already processed' });
    }

    if (accept) {
      //  ACCEPT: Store original times for audit trail
      const originalRequesterTime = {
        start: swapRequest.requesterSlotId.startTime,
        end: swapRequest.requesterSlotId.endTime
      };
      
      const originalRequestedTime = {
        start: swapRequest.requestedSlotId.startTime,
        end: swapRequest.requestedSlotId.endTime
      };

      // Swap the TIMES (keep ownership)
      await Event.findByIdAndUpdate(swapRequest.requesterSlotId._id, {
        startTime: originalRequestedTime.start,
        endTime: originalRequestedTime.end,
        status: 'BUSY',
        lastUpdated: new Date(),
        lastAction: 'SWAP_ACCEPTED'
      });

      await Event.findByIdAndUpdate(swapRequest.requestedSlotId._id, {
        startTime: originalRequesterTime.start,
        endTime: originalRequesterTime.end,
        status: 'BUSY',
        lastUpdated: new Date(),
        lastAction: 'SWAP_ACCEPTED'
      });

      // Update swap request with completion details
      swapRequest.status = 'ACCEPTED';
      swapRequest.respondedAt = new Date();
      swapRequest.responseMessage = responseMessage;
      swapRequest.completedAt = new Date();
      swapRequest.originalTimes = {
        requester: originalRequesterTime,
        requested: originalRequestedTime
      };

      await swapRequest.save();

      // Create notifications for both parties
      await createNotification({
        userId: swapRequest.requesterUserId._id,
        type: 'SWAP_ACCEPTED',
        title: 'Swap Request Accepted! ',
        message: `${req.user.name} accepted your swap request. Your events have been rescheduled.`,
        relatedId: swapRequest._id,
        actionRequired: false
      });

      await createNotification({
        userId: req.user._id,
        type: 'SWAP_COMPLETED',
        title: 'Swap Completed! ',
        message: `You accepted ${swapRequest.requesterUserId.name}'s swap request.`,
        relatedId: swapRequest._id,
        actionRequired: false
      });

      res.json({
        message: 'Swap accepted successfully! Events have been rescheduled.',
        swapRequest,
        timeline: {
          requested: swapRequest.createdAt,
          responded: swapRequest.respondedAt,
          completed: swapRequest.completedAt
        },
        updatedEvents: {
          requesterEvent: await Event.findById(swapRequest.requesterSlotId._id),
          requestedEvent: await Event.findById(swapRequest.requestedSlotId._id)
        }
      });

    } else {
      // REJECT: Reset slots with tracking
      await Event.findByIdAndUpdate(swapRequest.requesterSlotId._id, {
        status: 'SWAPPABLE',
        lastUpdated: new Date(),
        lastAction: 'SWAP_REJECTED'
      });
      
      await Event.findByIdAndUpdate(swapRequest.requestedSlotId._id, {
        status: 'SWAPPABLE',
        lastUpdated: new Date(),
        lastAction: 'SWAP_REJECTED'
      });

      // Update swap request with rejection details
      swapRequest.status = 'REJECTED';
      swapRequest.respondedAt = new Date();
      swapRequest.responseMessage = responseMessage || 'No reason provided';
      swapRequest.completedAt = new Date();

      await swapRequest.save();

      // Create notification for requester
      await createNotification({
        userId: swapRequest.requesterUserId._id,
        type: 'SWAP_REJECTED',
        title: 'Swap Request Declined',
        message: `${req.user.name} declined your swap request.`,
        relatedId: swapRequest._id,
        actionRequired: false
      });

      res.json({
        message: 'Swap request declined',
        swapRequest,
        timeline: {
          requested: swapRequest.createdAt,
          responded: swapRequest.respondedAt
        }
      });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET swap request history with status tracking
router.get('/history', auth, async (req, res) => {
  try {
    const { status, limit = 10, page = 1 } = req.query;
    
    const query = {
      $or: [
        { requesterUserId: req.user._id },
        { requestedUserId: req.user._id }
      ]
    };

    if (status && status !== 'all') {
      query.status = status;
    }

    const swapRequests = await SwapRequest.find(query)
      .populate('requesterSlotId')
      .populate('requestedSlotId')
      .populate('requesterUserId', 'name email')
      .populate('requestedUserId', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await SwapRequest.countDocuments(query);

    res.json({
      message: 'Swap history retrieved successfully',
      swapRequests,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total
      },
      summary: {
        pending: await SwapRequest.countDocuments({ ...query, status: 'PENDING' }),
        accepted: await SwapRequest.countDocuments({ ...query, status: 'ACCEPTED' }),
        rejected: await SwapRequest.countDocuments({ ...query, status: 'REJECTED' })
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET user's swap requests (incoming and outgoing) - 🚨 MISSING ENDPOINT ADDED!
router.get('/my-requests', auth, async (req, res) => {
  try {
    const incoming = await SwapRequest.find({ requestedUserId: req.user._id })
      .populate('requesterSlotId')
      .populate('requestedSlotId')
      .populate('requesterUserId', 'name email');

    const outgoing = await SwapRequest.find({ requesterUserId: req.user._id })
      .populate('requesterSlotId')
      .populate('requestedSlotId')
      .populate('requestedUserId', 'name email');

    res.json({ 
      message: 'Swap requests retrieved successfully',
      incoming,
      outgoing 
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// CANCEL swap request with tracking
router.delete('/swap-request/:requestId', auth, async (req, res) => {
  try {
    const swapRequest = await SwapRequest.findById(req.params.requestId)
      .populate('requesterSlotId')
      .populate('requestedSlotId')
      .populate('requestedUserId', 'name email');

    if (!swapRequest) {
      return res.status(404).json({ message: 'Swap request not found' });
    }

    // Verify the logged-in user is the requester
    if (swapRequest.requesterUserId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to cancel this request' });
    }

    if (swapRequest.status !== 'PENDING') {
      return res.status(400).json({ message: 'Cannot cancel a processed request' });
    }

    // Reset slots with tracking
    await Event.findByIdAndUpdate(swapRequest.requesterSlotId._id, {
      status: 'SWAPPABLE',
      lastUpdated: new Date(),
      lastAction: 'SWAP_CANCELLED'
    });

    await Event.findByIdAndUpdate(swapRequest.requestedSlotId._id, {
      status: 'SWAPPABLE',
      lastUpdated: new Date(),
      lastAction: 'SWAP_CANCELLED'
    });

    // Update swap request status
    swapRequest.status = 'CANCELLED';
    swapRequest.cancelledAt = new Date();
    await swapRequest.save();

    // Create notification for the other user
    await createNotification({
      userId: swapRequest.requestedUserId._id,
      type: 'SWAP_CANCELLED',
      title: 'Swap Request Cancelled',
      message: `${req.user.name} cancelled their swap request.`,
      relatedId: swapRequest._id,
      actionRequired: false
    });

    res.json({
      message: 'Swap request cancelled successfully',
      swapRequest,
      timeline: {
        requested: swapRequest.createdAt,
        cancelled: swapRequest.cancelledAt
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// HELPER: Create notification
async function createNotification({ userId, type, title, message, relatedId, actionRequired = false }) {
  try {
    const notification = new Notification({
      userId,
      type,
      title,
      message,
      relatedId,
      actionRequired,
      read: false,
      createdAt: new Date()
    });

    await notification.save();
    return notification;
  } catch (error) {
    console.error('Error creating notification:', error);
  }
}

module.exports = router;