const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');
const { protect } = require('../middleware/authMiddleware');

// Routes for customer exports
router.get('/', protect, customerController.getAllCustomers); // Standard customer listing
router.get('/export', protect, customerController.getCustomersForExport); // Formatted for export
router.get('/download-excel', protect, customerController.exportCustomersToExcel); // Direct Excel download

module.exports = router;