const mongoose = require('mongoose');

const commonEntrySchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    enum: ['fault_issue', 'device_condition'],
    index: true
  },
  value: {
    type: String,
    required: true,
    trim: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for efficient querying
commonEntrySchema.index({ type: 1, value: 1 });

module.exports = mongoose.model('CommonEntry', commonEntrySchema);