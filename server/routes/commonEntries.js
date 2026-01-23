const express = require('express');
const router = express.Router();
const commonEntryController = require('../controllers/commonEntryController');
const { protect } = require('../middleware/authMiddleware');

// Routes for managing common entries
router.get('/', protect, commonEntryController.getAllEntries);
router.get('/:type', protect, commonEntryController.getEntriesByType);
router.post('/', protect, commonEntryController.createEntry);
router.put('/:id', protect, commonEntryController.updateEntry);
router.delete('/:id', protect, commonEntryController.deleteEntry);
router.patch('/:id/restore', protect, commonEntryController.restoreEntry);

module.exports = router;