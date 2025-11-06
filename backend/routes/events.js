const express = require('express');
const Event = require('../models/Event');
const auth = require('../middleware/auth');
const router = express.Router();

// GET all events for logged-in user
router.get('/', auth, async (req, res) => {
  try {
    const events = await Event.find({ userId: req.user._id });
    res.json(events);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// CREATE new event
router.post('/', auth, async (req, res) => {
  try {
    const { title, startTime, endTime, status } = req.body;
    
    const event = new Event({
      title,
      startTime,
      endTime,
      status: status || 'BUSY',
      userId: req.user._id
    });
    
    await event.save();
    res.status(201).json(event);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// UPDATE event (mark as swappable, etc.)
router.put('/:id', auth, async (req, res) => {
  try {
    const { title, startTime, endTime, status } = req.body;
    
    const event = await Event.findOne({ _id: req.params.id, userId: req.user._id });
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }
    
    if (title) event.title = title;
    if (startTime) event.startTime = startTime;
    if (endTime) event.endTime = endTime;
    if (status) event.status = status;
    
    await event.save();
    res.json(event);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// DELETE event
router.delete('/:id', auth, async (req, res) => {
  try {
    const event = await Event.findOneAndDelete({ 
      _id: req.params.id, 
      userId: req.user._id 
    });
    
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }
    
    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;