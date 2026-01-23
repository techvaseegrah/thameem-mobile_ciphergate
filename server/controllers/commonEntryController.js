const CommonEntry = require('../models/CommonEntry');

// Get all entries by type
exports.getEntriesByType = async (req, res) => {
  try {
    const { type } = req.params;
    
    if (!['fault_issue', 'device_condition'].includes(type)) {
      return res.status(400).json({ error: 'Invalid type. Use "fault_issue" or "device_condition"' });
    }

    const entries = await CommonEntry.find({ type, isActive: true }).sort({ createdAt: -1 });
    
    res.json({ entries });
  } catch (error) {
    console.error('Error fetching entries:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get all entries (both types)
exports.getAllEntries = async (req, res) => {
  try {
    const entries = await CommonEntry.find({ isActive: true }).sort({ type: 1, createdAt: -1 });
    
    res.json({ entries });
  } catch (error) {
    console.error('Error fetching all entries:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Create a new entry
exports.createEntry = async (req, res) => {
  try {
    const { type, value } = req.body;

    if (!['fault_issue', 'device_condition'].includes(type)) {
      return res.status(400).json({ error: 'Invalid type. Use "fault_issue" or "device_condition"' });
    }

    if (!value || value.trim().length === 0) {
      return res.status(400).json({ error: 'Value is required' });
    }

    // Check if entry already exists
    const existingEntry = await CommonEntry.findOne({ 
      type, 
      value: value.trim(), 
      isActive: true 
    });

    if (existingEntry) {
      return res.status(400).json({ error: 'Entry already exists' });
    }

    const entry = new CommonEntry({
      type,
      value: value.trim()
    });

    await entry.save();

    res.status(201).json({ message: 'Entry created successfully', entry });
  } catch (error) {
    console.error('Error creating entry:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Update an entry
exports.updateEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const { value } = req.body;

    if (!value || value.trim().length === 0) {
      return res.status(400).json({ error: 'Value is required' });
    }

    const entry = await CommonEntry.findByIdAndUpdate(
      id,
      { value: value.trim() },
      { new: true }
    );

    if (!entry) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    res.json({ message: 'Entry updated successfully', entry });
  } catch (error) {
    console.error('Error updating entry:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Delete an entry (soft delete)
exports.deleteEntry = async (req, res) => {
  try {
    const { id } = req.params;

    const entry = await CommonEntry.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true }
    );

    if (!entry) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    res.json({ message: 'Entry deleted successfully' });
  } catch (error) {
    console.error('Error deleting entry:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Restore a deleted entry
exports.restoreEntry = async (req, res) => {
  try {
    const { id } = req.params;

    const entry = await CommonEntry.findByIdAndUpdate(
      id,
      { isActive: true },
      { new: true }
    );

    if (!entry) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    res.json({ message: 'Entry restored successfully', entry });
  } catch (error) {
    console.error('Error restoring entry:', error);
    res.status(500).json({ error: 'Server error' });
  }
};